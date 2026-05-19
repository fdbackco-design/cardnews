import * as path from "path";
import * as dotenv from "dotenv";
import type { CardNewsSet } from "../types/cardnews";

import {
  resolveCardImage,
  savePromptLog,
  type PromptLogEntry,
} from "./image/imageProvider";

export type { PromptLogEntry };

export type EnrichCardNewsResult = {
  deck: CardNewsSet;
  promptLog: PromptLogEntry[];
};
import { searchPexelsUnique }  from "./image/pexelsImageProvider";
import { getLocalFallbackUrl } from "./image/localImageProvider";

dotenv.config();

// FALLBACK_URL은 localImageProvider와 동일 — 하위 호환용
const FALLBACK_URL = getLocalFallbackUrl();

// ── 카드뉴스 이미지 일괄 적용 (메인 진입점) ──────────────────────────────────

export async function enrichCardNewsImages(deck: CardNewsSet): Promise<EnrichCardNewsResult> {
  const mode = process.env["IMAGE_PROVIDER"] ?? "hybrid";
  console.log(`[ImageSearch] 공급자 모드: ${mode}`);

  // Pexels 중복 방지용 URL Set (fallback 경로에서 공유)
  const usedUrls = new Set<string>();
  const promptLog: PromptLogEntry[] = [];
  const now = new Date().toISOString();

  // ── 표지 ────────────────────────────────────────────────────────────────
  const coverResult = await resolveCardImage({
    setId:      deck.id,
    cardIndex:  1,
    cardType:   "cover",
    topic:      deck.topic,
    title:      deck.title,
    subtitle:   deck.cover.subtitle,
    imageQuery: deck.cover.imageQuery,
  }, usedUrls);

  const coverLabel = coverResult.provider === "local" ? "fallback" : coverResult.provider;
  console.log(`  [표지] ${coverLabel}`);

  promptLog.push({
    cardIndex:   1,
    cardType:    "cover",
    topic:       deck.topic,
    title:       deck.title,
    subtitle:    deck.cover.subtitle,
    scene:       coverResult.scene,
    prompt:      coverResult.prompt ?? deck.cover.imageQuery ?? "",
    provider:    coverResult.provider,
    cached:      coverResult.cached ?? false,
    generatedAt: now,
  });

  // ── 내용 카드 ────────────────────────────────────────────────────────────
  const enrichedCards = [];
  for (const card of deck.cards) {
    const result = await resolveCardImage({
      setId:      deck.id,
      cardIndex:  card.index + 1,
      cardType:   "content",
      topic:      deck.topic,
      title:      card.title,
      subtitle:   card.subtitle,
      intro:      card.intro,
      highlights: card.highlights,
      outro:      card.outro,
      imageQuery: card.imageQuery,
    }, usedUrls);

    const cardLabel = result.provider === "local" ? "fallback" : result.provider;
    console.log(`  [카드 ${card.index}] ${cardLabel}`);

    promptLog.push({
      cardIndex:   card.index + 1,
      cardType:    "content",
      topic:       deck.topic,
      title:       card.title,
      subtitle:    card.subtitle,
      scene:       result.scene,
      prompt:      result.prompt ?? card.imageQuery ?? "",
      provider:    result.provider,
      cached:      result.cached ?? false,
      generatedAt: now,
    });

    enrichedCards.push({ ...card, imageUrl: result.url });
  }

  // ── 프롬프트 로그 저장 ─────────────────────────────────────────────────
  if (mode === "gemini" || mode === "hybrid") {
    savePromptLog(deck.id, promptLog);
  }

  const enrichedDeck: CardNewsSet = {
    ...deck,
    cover: { ...deck.cover, imageUrl: coverResult.url },
    cards: enrichedCards,
  };

  return { deck: enrichedDeck, promptLog };
}

// ── 하위 호환 exports ──────────────────────────────────────────────────────────

/** 단일 Pexels 검색 (하위 호환) */
export async function searchImage(query: string, usedUrls?: Set<string>): Promise<string> {
  return searchPexelsUnique(query, usedUrls);
}

/** @deprecated searchImage() 사용 권장 */
export async function searchGoogleImage(_query: string): Promise<string> {
  console.warn("[searchGoogleImage] deprecated — Google CSE 비활성화 상태");
  return FALLBACK_URL;
}

export async function resolveImageUrl(query: string): Promise<string | undefined> {
  const url = await searchImage(query);
  return url === FALLBACK_URL ? undefined : url;
}
