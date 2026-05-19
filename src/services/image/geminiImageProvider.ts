import * as fs   from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import * as dotenv from "dotenv";
import sharp from "sharp";

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
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
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

  // ── 파일 저장 (sharp로 1080×1350 cover crop) ─────────────────────────────
  try {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const rawBuffer = Buffer.from(result.bytes, "base64");
    const cropped   = await sharp(rawBuffer)
      .resize(1080, 1350, { fit: "cover", position: "top" })
      .png()
      .toBuffer();
    fs.writeFileSync(localPath, cropped);
    console.log(`[GeminiImage] generated (${result.model}): ${path.basename(localPath)}`);

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
