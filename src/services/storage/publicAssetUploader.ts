/**
 * 공개 이미지 URL 업로더
 *
 * Instagram Graph API는 로컬 파일을 직접 업로드할 수 없고, 외부에서 접근 가능한
 * 공개 HTTPS URL이 필요하다. 이 모듈은 로컬 PNG → 공개 URL 변환을 담당한다.
 *
 * 현재 지원 provider:
 *   - local-placeholder : 미설정. 업로드를 차단한다. (안전 기본값)
 *   - r2                : Cloudflare R2 (S3 호환). 향후 구현 예정.
 *   - s3                : AWS S3. 향후 구현 예정.
 */

import * as fs from "fs";
import * as path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export type PublicAssetProvider = "local-placeholder" | "r2" | "s3";

export type UploadedAsset = {
  localPath: string;
  publicUrl: string;
};

export type UploadParams = {
  setId: string;
  imagePaths: string[];
};

export type ProviderConfigStatus = {
  provider: PublicAssetProvider;
  configured: boolean;
  missing: string[];
};

// ── 설정 진단 ────────────────────────────────────────────────────────────────

/** 현재 PUBLIC_ASSET_PROVIDER 값을 안전한 enum 형태로 반환 */
export function getActiveProvider(): PublicAssetProvider {
  const raw = (process.env["PUBLIC_ASSET_PROVIDER"] ?? "").trim().toLowerCase();
  if (raw === "r2" || raw === "s3") return raw;
  return "local-placeholder";
}

/** provider별로 필요한 env가 채워져 있는지 검사 — UI에서 버튼 비활성화 판단에 사용 */
export function getProviderConfigStatus(): ProviderConfigStatus {
  const provider = getActiveProvider();

  if (provider === "r2") {
    const required = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "R2_PUBLIC_BASE_URL",
    ];
    const missing = required.filter((k) => !process.env[k]?.trim());
    return { provider, configured: missing.length === 0, missing };
  }

  if (provider === "s3") {
    const required = [
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "S3_BUCKET",
      "S3_PUBLIC_BASE_URL",
    ];
    const missing = required.filter((k) => !process.env[k]?.trim());
    return { provider, configured: missing.length === 0, missing };
  }

  // local-placeholder — 의도적으로 미구성. UI에서 안내 문구로 차단해야 함.
  return { provider: "local-placeholder", configured: false, missing: ["PUBLIC_ASSET_PROVIDER"] };
}

// ── Provider 인터페이스 ──────────────────────────────────────────────────────

interface AssetUploaderProvider {
  readonly name: PublicAssetProvider;
  upload(params: UploadParams): Promise<UploadedAsset[]>;
}

// ── 메인 진입점 ──────────────────────────────────────────────────────────────

export async function uploadImagesForInstagram(
  params: UploadParams
): Promise<UploadedAsset[]> {
  const status = getProviderConfigStatus();
  if (!status.configured) {
    if (status.provider === "local-placeholder") {
      throw new Error(
        "공개 이미지 저장소(R2/S3) 설정이 필요합니다. .env의 PUBLIC_ASSET_PROVIDER를 r2 또는 s3으로 변경하세요."
      );
    }
    throw new Error(
      `공개 이미지 저장소 설정이 불완전합니다 (provider=${status.provider}): ` +
        `누락 환경변수 — ${status.missing.join(", ")}`
    );
  }

  // 입력 검증
  if (!params.setId) throw new Error("setId가 비어 있습니다.");
  if (!params.imagePaths?.length) throw new Error("imagePaths가 비어 있습니다.");
  for (const p of params.imagePaths) {
    const localPath = resolveLocalPath(p);
    if (!fs.existsSync(localPath)) {
      throw new Error(`이미지 파일을 찾을 수 없습니다: ${localPath}`);
    }
  }

  const provider = resolveProvider(status.provider);
  return provider.upload(params);
}

function resolveProvider(name: PublicAssetProvider): AssetUploaderProvider {
  switch (name) {
    case "r2":
      return new R2Uploader();
    case "s3":
      return new S3Uploader();
    case "local-placeholder":
    default:
      return new LocalPlaceholderUploader();
  }
}

// ── 입력 경로 정규화 ─────────────────────────────────────────────────────────

/**
 * imagePaths는 다음 형태가 섞여 들어올 수 있어 일관적으로 절대 경로로 정규화한다.
 *   - 절대 경로:        /Users/.../output/{setId}/images/card-01.png
 *   - 웹 경로:          /output/{setId}/images/card-01.png
 *   - 상대 경로:        output/{setId}/images/card-01.png
 */
export function resolveLocalPath(input: string): string {
  if (path.isAbsolute(input) && !input.startsWith("/output/")) {
    return input;
  }
  const stripped = input.replace(/^\/+/, "");
  return path.resolve(process.cwd(), stripped);
}

// ── Provider 구현체 ─────────────────────────────────────────────────────────

/** 안전 기본값 — 실제 호출 시 위에서 차단되지만 방어용으로 같은 에러 던짐 */
class LocalPlaceholderUploader implements AssetUploaderProvider {
  readonly name: PublicAssetProvider = "local-placeholder";
  async upload(_params: UploadParams): Promise<UploadedAsset[]> {
    throw new Error(
      "PUBLIC_ASSET_PROVIDER=local-placeholder 상태에서는 Instagram 업로드가 불가능합니다."
    );
  }
}

/** Cloudflare R2 — @aws-sdk/client-s3 (S3 호환) */
class R2Uploader implements AssetUploaderProvider {
  readonly name: PublicAssetProvider = "r2";

  async upload(params: UploadParams): Promise<UploadedAsset[]> {
    const accountId = (process.env["R2_ACCOUNT_ID"] ?? "").trim();
    const accessKeyId = (process.env["R2_ACCESS_KEY_ID"] ?? "").trim();
    const secretAccessKey = (process.env["R2_SECRET_ACCESS_KEY"] ?? "").trim();
    const bucket = (process.env["R2_BUCKET"] ?? "").trim();
    const baseUrl = (process.env["R2_PUBLIC_BASE_URL"] ?? "").replace(/\/+$/, "").trim();

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !baseUrl) {
      throw new Error("R2 환경변수가 불완전합니다. R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL를 확인하세요.");
    }

    const client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    const results: UploadedAsset[] = [];
    for (const localPath of params.imagePaths) {
      const abs = resolveLocalPath(localPath);
      const filename = path.basename(abs);
      const key = `cardnews/${params.setId}/${filename}`;
      const body = fs.readFileSync(abs);

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "image/png",
      }));

      console.log(`[R2] 업로드: ${key}`);
      const encodedKey = key.split("/").map(encodeURIComponent).join("/");
      results.push({ localPath: abs, publicUrl: `${baseUrl}/${encodedKey}` });
    }

    return results;
  }
}

/** AWS S3 — 동일한 인터페이스, 다음 Phase에서 구현 예정 */
class S3Uploader implements AssetUploaderProvider {
  readonly name: PublicAssetProvider = "s3";

  async upload(_params: UploadParams): Promise<UploadedAsset[]> {
    throw new Error(
      "AWS S3 업로더는 아직 구현되지 않았습니다. (publicAssetUploader.ts → S3Uploader)"
    );
  }
}
