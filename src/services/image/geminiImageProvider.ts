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
          // 1080×1350 = 4:5 (카드뉴스 규격; 저장 시 sharp로 정확히 리사이즈)
          aspectRatio:       "4:5",
          personGeneration:  "ALLOW_ADULT",
          safetyFilterLevel: "BLOCK_SOME",
          // negativePrompt: Imagen API에서 더 이상 지원하지 않으므로 제거
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
          // responseModalities에 IMAGE만 지정 — TEXT 포함 시 텍스트 응답이 우선되어 이미지 미반환
          responseModalities: ["IMAGE"],
          // 비율은 generateContent API에서 지원하지 않으므로 프롬프트 텍스트로만 제어
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

// ── 블러 배경 채우기 ──────────────────────────────────────────────────────────
// 단색(흰색·회색) 여백 없이 원본 이미지를 활용한 블러 배경으로 target 크기를 채운다.
//
// 알고리즘:
//   1. 원본을 cover 확대 후 blur → 배경 (단색 없음)
//   2. 원본을 비율 유지하며 target 안에 꽉 맞게 축소 → 전경
//   3. 전경을 배경 중앙에 합성 → 최종
//
// 원본이 이미 target 비율과 같으면 전경이 배경 전체를 덮어 blur가 보이지 않는다.

async function buildBlurredFill(
  source:  Buffer,
  targetW: number,
  targetH: number,
): Promise<Buffer> {
  const { width: srcW = targetW, height: srcH = targetH } =
    await sharp(source).metadata();

  // 배경: cover crop → 강한 blur (단색 아닌 원본 텍스처로 채움)
  const bg = await sharp(source)
    .resize(targetW, targetH, { fit: "cover", position: "center" })
    .blur(24)
    .png()
    .toBuffer();

  // 전경: 비율 유지하며 target 안에 완전히 들어오게 단순 스케일
  const scale = Math.min(targetW / srcW, targetH / srcH);
  const fgW   = Math.round(srcW * scale);
  const fgH   = Math.round(srcH * scale);

  // 이미 target 크기이면 배경(= 블러 없는 원본)을 재생성해 반환
  if (fgW === targetW && fgH === targetH) {
    return sharp(source)
      .resize(targetW, targetH, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
  }

  const fg   = await sharp(source)
    .resize(fgW, fgH, { fit: "fill" })
    .png()
    .toBuffer();

  const left = Math.round((targetW - fgW) / 2);
  const top  = Math.round((targetH - fgH) / 2);

  return sharp(bg)
    .composite([{ input: fg, left, top }])
    .png()
    .toBuffer();
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
  //  1. IMAGE_GENERATION_MODEL 환경변수 (설정된 경우)
  //  2. gemini-2.5-flash-image            (기본값)
  //  3. IMAGEN_MODEL 환경변수             (선택적 — Imagen 계열)
  // ──────────────────────────────────────────────────────────────────────────
  const customModel = process.env["IMAGE_GENERATION_MODEL"];
  const imagenModel = process.env["IMAGEN_MODEL"];

  const modelQueue: string[] = [];
  if (customModel) modelQueue.push(customModel);
  modelQueue.push("gemini-2.5-flash-image");
  if (imagenModel && !modelQueue.includes(imagenModel)) modelQueue.push(imagenModel);

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

    // 1단계: 흰색 letterbox/padding 제거 (API가 흰 테두리를 포함할 경우 대비)
    const trimmedBuffer = await sharp(rawBuffer)
      .trim({ background: "#ffffff", threshold: 10 })
      .toBuffer()
      .catch(() => rawBuffer);

    // 2단계: 표지 vs 본문 보정 방식 분기
    //   표지(cover): cover crop — 전체 프레임을 이미지로 꽉 채움, 블러 없음
    //   본문(content): blur fill — 비율이 다를 때 단색 대신 블러 배경으로 채움
    let finalBuffer: Buffer;
    if (params.cardType === "cover") {
      finalBuffer = await sharp(trimmedBuffer)
        .resize(CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT, { fit: "cover", position: "center" })
        .png()
        .toBuffer();
    } else {
      finalBuffer = await buildBlurredFill(trimmedBuffer, CARD_IMAGE_WIDTH, CARD_IMAGE_HEIGHT);
    }

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
