import { Router, Request, Response } from "express";
import * as path from "path";

import { generateDraft } from "../services/instagramDraft";
import {
  getProviderConfigStatus,
  uploadImagesForInstagram,
} from "../../services/storage/publicAssetUploader";
import {
  publishInstagramCarousel,
  type PublishResult,
} from "../../services/instagram/instagramPublisher";
import { writeTextFile } from "../../utils/fs";

export const instagramRoutes = Router();

// ── GET /api/instagram/config ─────────────────────────────────────────────────
// UI가 "게시 가능 상태"인지 확인하기 위해 호출.
// 토큰/계정/공개 저장소 설정 유무를 모두 반환한다.
instagramRoutes.get("/config", (_req: Request, res: Response) => {
  const provider = getProviderConfigStatus();
  const hasToken = Boolean(process.env["INSTAGRAM_ACCESS_TOKEN"]?.trim());
  const hasBusinessId = Boolean(process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"]?.trim());
  const apiVersion = process.env["META_GRAPH_API_VERSION"]?.trim() || "v25.0";

  const missing: string[] = [];
  if (!provider.configured) missing.push(...provider.missing.map((m) => `public-storage:${m}`));
  if (!hasToken) missing.push("INSTAGRAM_ACCESS_TOKEN");
  if (!hasBusinessId) missing.push("INSTAGRAM_BUSINESS_ACCOUNT_ID");

  const canPublish = provider.configured && hasToken && hasBusinessId;

  res.json({
    canPublish,
    apiVersion,
    publicAsset: {
      provider: provider.provider,
      configured: provider.configured,
    },
    instagram: {
      hasAccessToken: hasToken,
      hasBusinessAccountId: hasBusinessId,
    },
    missing,
    hint: !canPublish
      ? "공개 이미지 저장소 설정이 필요합니다. .env의 PUBLIC_ASSET_PROVIDER와 R2/S3 변수, " +
        "그리고 INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID를 설정하세요."
      : undefined,
  });
});

// ── POST /api/instagram/draft ─────────────────────────────────────────────────
// req:  { setId }
// resp: { setId, title, caption, imagePaths }
instagramRoutes.post("/draft", (req: Request, res: Response) => {
  const { setId } = req.body as { setId?: string };
  if (!setId) {
    res.status(400).json({ error: "setId required" });
    return;
  }
  try {
    const draft = generateDraft(setId);
    res.json(draft);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/instagram/upload ────────────────────────────────────────────────
// req:  { setId, caption, imagePaths }
// resp 성공: { status: "published", mediaId, containerId, ... }
// resp 실패: { status: "failed", failedStep, error, ... }
// 미설정:    HTTP 400 — { error: "공개 이미지 저장소(R2/S3) 설정이 필요합니다." }
instagramRoutes.post("/upload", async (req: Request, res: Response) => {
  const { setId, caption, imagePaths } = req.body as {
    setId?: string;
    caption?: string;
    imagePaths?: string[];
  };

  if (!setId || !caption || !Array.isArray(imagePaths) || !imagePaths.length) {
    res.status(400).json({ error: "setId, caption, imagePaths required" });
    return;
  }

  // 0) 사전 점검 — 공개 저장소가 설정돼 있지 않으면 즉시 400
  const provider = getProviderConfigStatus();
  if (!provider.configured) {
    res.status(400).json({
      status: "blocked",
      error: "공개 이미지 저장소(R2/S3) 설정이 필요합니다.",
      provider: provider.provider,
      missing: provider.missing,
    });
    return;
  }

  // 1) Instagram 자격 증명 점검
  const accessToken = (process.env["INSTAGRAM_ACCESS_TOKEN"] ?? "").trim();
  const igUserId = (process.env["INSTAGRAM_BUSINESS_ACCOUNT_ID"] ?? "").trim();
  if (!accessToken || !igUserId) {
    res.status(400).json({
      status: "blocked",
      error: "INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_BUSINESS_ACCOUNT_ID 환경변수가 필요합니다.",
    });
    return;
  }

  const createdAt = new Date().toISOString();
  console.log("[Instagram] 업로드 시작");
  console.log(`  setId         : ${setId}`);
  console.log(`  selectedCount : ${imagePaths.length}`);
  console.log(`  provider      : ${provider.provider}`);

  let publicAssets: { localPath: string; publicUrl: string }[] = [];
  let publishResult: PublishResult | null = null;

  try {
    // 2) 로컬 → 공개 URL 업로드
    publicAssets = await uploadImagesForInstagram({ setId, imagePaths });
    const imageUrls = publicAssets.map((a) => a.publicUrl);
    console.log(`[Instagram] 공개 URL ${imageUrls.length}개 확보`);

    // 3) Carousel 게시
    publishResult = await publishInstagramCarousel({
      igUserId,
      accessToken,
      caption,
      imageUrls,
    });

    // 4) 로그 저장 (성공/실패 모두)
    const logBody = buildUploadLog({
      setId,
      caption,
      imageUrls,
      publicAssets,
      publishResult,
      createdAt,
    });
    saveUploadLog(setId, logBody);

    if (publishResult.success) {
      console.log(`[Instagram] 게시 성공: media_id=${publishResult.mediaId}`);
      res.json({
        status: "published",
        message: "Instagram에 성공적으로 게시되었습니다.",
        setId,
        mediaId: publishResult.mediaId,
        containerId: publishResult.containerId,
        imageCount: imageUrls.length,
        steps: publishResult.steps,
      });
      return;
    }

    console.warn(
      `[Instagram] 게시 실패 (step=${publishResult.failedStep}): ${publishResult.error}`
    );
    res.status(502).json({
      status: "failed",
      setId,
      failedStep: publishResult.failedStep,
      error: publishResult.error,
      steps: publishResult.steps,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Instagram] 업로드 중 예외: ${msg}`);

    // 예외도 로그로 저장
    const logBody = buildUploadLog({
      setId,
      caption,
      imageUrls: publicAssets.map((a) => a.publicUrl),
      publicAssets,
      publishResult,
      createdAt,
      exception: msg,
    });
    try {
      saveUploadLog(setId, logBody);
    } catch {
      /* ignore log write failure */
    }

    res.status(500).json({
      status: "failed",
      setId,
      error: msg,
    });
  }
});

// ── 로그 저장 ────────────────────────────────────────────────────────────────

type UploadLog = {
  setId: string;
  caption: string;
  imageUrls: string[];
  imageCount: number;
  publicAssets: { localPath: string; publicUrl: string }[];
  status: "published" | "failed" | "exception";
  failedStep?: string;
  mediaId: string | null;
  containerId: string | null;
  error: string | null;
  steps: unknown[];
  createdAt: string;
};

function buildUploadLog(args: {
  setId: string;
  caption: string;
  imageUrls: string[];
  publicAssets: { localPath: string; publicUrl: string }[];
  publishResult: PublishResult | null;
  createdAt: string;
  exception?: string;
}): UploadLog {
  const { setId, caption, imageUrls, publicAssets, publishResult, createdAt, exception } = args;

  if (exception) {
    return {
      setId,
      caption,
      imageUrls,
      imageCount: imageUrls.length,
      publicAssets,
      status: "exception",
      mediaId: null,
      containerId: null,
      error: exception,
      steps: publishResult?.steps ?? [],
      createdAt,
    };
  }

  if (!publishResult) {
    return {
      setId,
      caption,
      imageUrls,
      imageCount: imageUrls.length,
      publicAssets,
      status: "failed",
      mediaId: null,
      containerId: null,
      error: "publishResult가 생성되지 않음",
      steps: [],
      createdAt,
    };
  }

  if (publishResult.success) {
    return {
      setId,
      caption,
      imageUrls,
      imageCount: imageUrls.length,
      publicAssets,
      status: "published",
      mediaId: publishResult.mediaId,
      containerId: publishResult.containerId,
      error: null,
      steps: publishResult.steps,
      createdAt,
    };
  }

  return {
    setId,
    caption,
    imageUrls,
    imageCount: imageUrls.length,
    publicAssets,
    status: "failed",
    failedStep: publishResult.failedStep,
    mediaId: null,
    containerId: null,
    error: publishResult.error,
    steps: publishResult.steps,
    createdAt,
  };
}

function saveUploadLog(setId: string, body: UploadLog): void {
  const outputBase = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
  const logPath = path.join(outputBase, setId, "instagram-upload-log.json");
  writeTextFile(logPath, JSON.stringify(body, null, 2));
  console.log(`[Instagram] 로그 저장: ${logPath}`);
}
