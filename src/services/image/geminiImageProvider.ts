import * as fs   from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import * as dotenv from "dotenv";
import sharp from "sharp";

import {
  CARD_IMAGE_HEIGHT,
  CARD_IMAGE_WIDTH,
} from "./imagePromptBuilder";

dotenv.config();

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type GeminiImageResult = {
  url:       string;
  localPath: string;
  provider:  "gemini";
  prompt:    string;
  cached:    boolean;
  model?:    string;
};

type ImagenResponseBody = {
  predictions?:     { bytesBase64Encoded?: string; mimeType?: string }[];
  generatedImages?: { image?: { imageBytes?: string } }[];
  candidates?:      { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  error?:           { code: number; message: string; status?: string };
};

// 같은 프로세스 실행 내에서 404/400 반환 모델은 재시도하지 않음
const failedModels = new Set<string>();

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function padIndex(n: number): string {
  return String(n).padStart(2, "0");
}

function resolveOutputPath(setId: string, cardIndex: number): string {
  return path.resolve("output", "generated-images", setId, `card-${padIndex(cardIndex)}.png`);
}

function extractBase64(data: ImagenResponseBody): string | undefined {
  if (data.predictions?.[0]?.bytesBase64Encoded)     return data.predictions[0].bytesBase64Encoded;
  if (data.generatedImages?.[0]?.image?.imageBytes)  return data.generatedImages[0].image!.imageBytes;
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  return part?.inlineData?.data;
}

// ── Imagen :predict (imagen-4 계열) ───────────────────────────────────────────

async function callPredict(
  model:  string,
  prompt: string,
  apiKey: string,
): Promise<{ bytes: string; model: string } | null> {
  if (failedModels.has(model)) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances:  [{ prompt }],
        parameters: {
          sampleCount:       1,
          // "4:5"는 Imagen 미지원 → 가장 가까운 세로 비율 "3:4" 사용
          // 저장 시 sharp fit:"cover"로 1080×1350 정확히 크롭
          aspectRatio:       "3:4",
          personGeneration:  "ALLOW_ADULT",
          safetyFilterLevel: "BLOCK_SOME",
        },
      }),
    });

    if (!res.ok) {
      failedModels.add(model);
      const msg = (await res.text().catch(() => "")).slice(0, 100);
      console.warn(`[GeminiImage] ${model} HTTP ${res.status} — ${msg}`);
      return null;
    }

    const data = (await res.json()) as ImagenResponseBody;
    if (data.error) {
      failedModels.add(model);
      console.warn(`[GeminiImage] ${model} 오류 ${data.error.code}: ${data.error.message.slice(0, 80)}`);
      return null;
    }

    const bytes = extractBase64(data);
    return bytes ? { bytes, model } : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[GeminiImage] ${model} 요청 실패 — ${msg.slice(0, 80)}`);
    return null;
  }
}

// ── Gemini generateContent 이미지 출력 모드 ────────────────────────────────────

async function callGenerateContent(
  model:  string,
  prompt: string,
  apiKey: string,
): Promise<{ bytes: string; model: string } | null> {
  if (failedModels.has(model)) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          // v1beta 공식 규격: generationConfig.imageConfig (top-level imageGenerationConfig 아님)
          imageConfig: {
            aspectRatio: "4:5",
            imageSize:   "1K",
          },
        },
      }),
    });

    if (!res.ok) {
      failedModels.add(model);
      const msg = (await res.text().catch(() => "")).slice(0, 100);
      console.warn(`[GeminiImage] ${model} HTTP ${res.status} — ${msg}`);
      return null;
    }

    const data = (await res.json()) as ImagenResponseBody;
    if (data.error) {
      failedModels.add(model);
      console.warn(`[GeminiImage] ${model} 오류 ${data.error.code}: ${data.error.message.slice(0, 80)}`);
      return null;
    }

    const bytes = extractBase64(data);
    return bytes ? { bytes, model } : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[GeminiImage] ${model} 요청 실패 — ${msg.slice(0, 80)}`);
    return null;
  }
}

// ── 모델 종류에 따른 자동 라우팅 ──────────────────────────────────────────────

function callModel(
  model:  string,
  prompt: string,
  apiKey: string,
): Promise<{ bytes: string; model: string } | null> {
  return model.startsWith("imagen-")
    ? callPredict(model, prompt, apiKey)
    : callGenerateContent(model, prompt, apiKey);
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

export async function generateImagenCardImage(params: {
  setId:       string;
  cardIndex:   number;
  cardType:    "cover" | "content";
  topic:       string;
  title:       string;
  subtitle?:   string;
  intro?:      string;
  highlights?: string[];
  outro?:      string;
  prompt:      string;
}): Promise<GeminiImageResult | null> {
  const apiKey = process.env["GEMINI_API_KEY"] ?? "";
  if (!apiKey) {
    console.warn("[GeminiImage] GEMINI_API_KEY 미설정 — Pexels로 fallback");
    return null;
  }

  const localPath = resolveOutputPath(params.setId, params.cardIndex);

  // ── 캐시 확인 ──────────────────────────────────────────────────────────────
  const forceRegen = process.env["FORCE_REGENERATE_IMAGES"] === "true";
  if (!forceRegen && fs.existsSync(localPath)) {
    console.log(`[GeminiImage] cached: ${path.basename(localPath)}`);
    return {
      url:      pathToFileURL(localPath).href,
      localPath,
      provider: "gemini",
      prompt:   params.prompt,
      cached:   true,
      model:    process.env["IMAGE_GENERATION_MODEL"] ?? "gemini-2.5-flash-image",
    };
  }

  // ── 모델 시도 순서 ─────────────────────────────────────────────────────────
  //  Imagen (:predict API) → aspectRatio:"4:5" 네이티브 지원 → 4:5 비율 보장
  //  Gemini Flash (:generateContent) → aspectRatio 미지원, 비율 불보장 (fallback)
  //
  //  1. IMAGEN_MODEL 환경변수 (callPredict — aspectRatio 4:5 지원)
  //  2. IMAGE_GENERATION_MODEL 환경변수 (명시 지정 시)
  //  3. gemini-2.5-flash-image (최후 fallback, 비율 보장 없음)
  // ──────────────────────────────────────────────────────────────────────────
  const customModel = process.env["IMAGE_GENERATION_MODEL"];
  const imagenModel = process.env["IMAGEN_MODEL"];

  const modelQueue: string[] = [];
  // 1순위: 4:5 네이티브 지원 — Gemini Flash (:generateContent, aspectRatio:"4:5")
  if (customModel && !customModel.startsWith("imagen-")) modelQueue.push(customModel);
  if (!modelQueue.includes("gemini-2.5-flash-image")) modelQueue.push("gemini-2.5-flash-image");
  // 2순위 fallback: Imagen (:predict, aspectRatio:"3:4" → cover crop으로 1080×1350)
  if (imagenModel && !modelQueue.includes(imagenModel)) modelQueue.push(imagenModel);
  if (customModel?.startsWith("imagen-") && !modelQueue.includes(customModel)) modelQueue.push(customModel);

  let result: { bytes: string; model: string } | null = null;
  for (const model of modelQueue) {
    result = await callModel(model, params.prompt, apiKey);
    if (result) break;
  }

  if (!result) {
    console.warn("[GeminiImage] 모든 모델 시도 실패 — Pexels로 fallback");
    return null;
  }

  // ── 파일 저장 (반드시 CARD_IMAGE_WIDTH×CARD_IMAGE_HEIGHT, 단색 여백 금지) ─────
  // 보정 방식: 원본 블러 배경 + 원본 중앙 합성 (회색·흰색 padding 절대 금지)
  try {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const rawBuffer = Buffer.from(result.bytes, "base64");

    // 1단계: letterbox/padding 제거 — 코너 픽셀 색상 자동 감지 (흰색·베이지·회색 모두 처리)
    const trimmedBuffer = await sharp(rawBuffer)
      .trim({ threshold: 15 })
      .toBuffer()
      .catch(() => rawBuffer);

    // 2단계: cover crop으로 정확히 1080×1350 보장
    //   - fit:"cover" → 비율 유지하며 확대 후 중앙 크롭, 빈 여백 절대 없음
    //   - fit:"contain" / 단색 캔버스 / letterbox 방식 사용 금지
    const finalBuffer = await sharp(trimmedBuffer)
      .resize(CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    // 3단계: 치수 최종 검증
    const meta = await sharp(finalBuffer).metadata();
    if (meta.width !== CARD_IMAGE_WIDTH || meta.height !== CARD_IMAGE_HEIGHT) {
      console.warn(
        `[GeminiImage] 치수 검증 실패(${meta.width}×${meta.height}) — Pexels fallback`,
      );
      return null;
    }

    fs.writeFileSync(localPath, finalBuffer);
    console.log(
      `[GeminiImage] generated (${result.model}): ${path.basename(localPath)} ` +
        `(${CARD_IMAGE_WIDTH}×${CARD_IMAGE_HEIGHT})`,
    );

    return {
      url:      pathToFileURL(localPath).href,
      localPath,
      provider: "gemini",
      prompt:   params.prompt,
      cached:   false,
      model:    result.model,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[GeminiImage] 파일 저장 실패 — ${msg.slice(0, 60)}`);
    return null;
  }
}
