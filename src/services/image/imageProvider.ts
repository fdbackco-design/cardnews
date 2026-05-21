import * as fs   from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import {
  buildCardImagePrompt,
  buildImagenPromptFromLlmQuery,
  isLlmCraftedImageQuery,
  type CardScene,
} from "./imagePromptBuilder";
import { generateImagenCardImage }              from "./geminiImageProvider";
import { searchPexelsUnique }                   from "./pexelsImageProvider";
import { getLocalFallbackUrl }                  from "./localImageProvider";

dotenv.config();

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type { CardScene };

export type ImageProviderMode = "gemini" | "hybrid" | "pexels" | "local";

export type ResolveCardImageParams = {
  setId:       string;
  cardIndex:   number;
  cardType:    "cover" | "content";
  topic:       string;
  title:       string;
  subtitle?:   string;
  intro?:      string;
  highlights?: string[];
  outro?:      string;
  imageQuery?: string;
};

export type CardImageResult = {
  url:      string;
  provider: "gemini" | "pexels" | "local";
  prompt?:  string;
  scene?:   CardScene;
  cached?:  boolean;
};

export type PromptLogEntry = {
  cardIndex:   number;
  cardType:    "cover" | "content";
  topic:       string;
  title:       string;
  subtitle?:   string;
  scene?:      CardScene;
  prompt:      string;
  provider:    string;
  cached:      boolean;
  generatedAt: string;
};

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function padIndex(n: number): string {
  return String(n).padStart(2, "0");
}

function getMode(): ImageProviderMode {
  return (process.env["IMAGE_PROVIDER"] ?? "hybrid") as ImageProviderMode;
}

/** LLM imagePrompt 사용 시 prompts.json용 scene 요약 */
function inferSceneFallback(params: ResolveCardImageParams): CardScene {
  const { scene } = buildCardImagePrompt({
    cardType:   params.cardType,
    cardIndex:  params.cardIndex,
    topic:      params.topic,
    title:      params.title,
    subtitle:   params.subtitle,
    intro:      params.intro,
    highlights: params.highlights,
    outro:      params.outro,
  });
  return { ...scene, category: params.cardType === "cover" ? "cover" : scene.category };
}

// ── 카드 이미지 해결 (우선순위 라우팅) ────────────────────────────────────────

export async function resolveCardImage(
  params:    ResolveCardImageParams,
  usedUrls?: Set<string>,
): Promise<CardImageResult> {
  const mode  = getMode();
  const label = `card-${padIndex(params.cardIndex)}`;

  // ── Gemini/Imagen 우선 시도 (gemini | hybrid) ────────────────────────────
  if (mode === "gemini" || mode === "hybrid") {
    const llmQuery = params.imageQuery?.trim() ?? "";
    const useLlmPrompt = llmQuery.length > 0 && isLlmCraftedImageQuery(llmQuery);

    const { prompt, scene } = useLlmPrompt
      ? {
          prompt: buildImagenPromptFromLlmQuery(llmQuery),
          scene: inferSceneFallback(params),
        }
      : buildCardImagePrompt({
          cardType:   params.cardType,
          cardIndex:  params.cardIndex,
          topic:      params.topic,
          title:      params.title,
          subtitle:   params.subtitle,
          intro:      params.intro,
          highlights: params.highlights,
          outro:      params.outro,
        });

    const result = await generateImagenCardImage({
      setId:      params.setId,
      cardIndex:  params.cardIndex,
      cardType:   params.cardType,
      topic:      params.topic,
      title:      params.title,
      subtitle:   params.subtitle,
      intro:      params.intro,
      highlights: params.highlights,
      outro:      params.outro,
      prompt,
    });

    if (result) {
      console.log(`[ImageProvider] ${label} provider=gemini${result.cached ? " (cached)" : ""} [${scene.category}/${scene.subjectType}/${scene.shotType}]`);
      return { url: result.url, provider: "gemini", prompt: result.prompt, scene, cached: result.cached };
    }
  }

  // ── Pexels fallback (gemini | hybrid | pexels) ───────────────────────────
  if (mode !== "local") {
    const query =
      params.imageQuery?.trim() ||
      `${params.topic} ${params.title} health lifestyle photo portrait dark`;

    const url = await searchPexelsUnique(query, usedUrls);
    if (url !== getLocalFallbackUrl()) {
      const suffix = (mode === "gemini" || mode === "hybrid") ? " (pexels fallback)" : "";
      console.log(`[ImageProvider] ${label} provider=pexels${suffix}`);
      return { url, provider: "pexels" };
    }
  }

  // ── local fallback ───────────────────────────────────────────────────────
  console.log(`[ImageProvider] ${label} provider=local fallback`);
  return { url: getLocalFallbackUrl(), provider: "local" };
}

// ── 프롬프트 로그 저장 ─────────────────────────────────────────────────────────

export function savePromptLog(setId: string, entries: PromptLogEntry[]): void {
  const dir      = path.resolve("output", "generated-images", setId);
  const logPath  = path.join(dir, "prompts.json");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2), "utf-8");
}
