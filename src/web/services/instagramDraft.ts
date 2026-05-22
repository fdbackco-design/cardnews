import * as path from "path";

import { loadDeck, getSetInfo } from "./cardNewsEditor";
import type { CardNewsSet } from "../../types/cardnews";

export type InstagramDraft = {
  setId: string;
  title: string;
  caption: string;
  imagePaths: string[];
};

/**
 * 인스타그램 캡션 초안을 생성한다.
 *
 * 캡션 구조:
 *   오늘의 라이프 가이드
 *
 *   {표지 소제목 또는 인트로 2줄}
 *
 *   ✔ {카드 1 제목}
 *   ✔ {카드 2 제목}
 *   ✔ {카드 3 제목}
 *
 *   저장해두고 필요할 때 다시 확인해보세요.
 *
 *   #TYLifePartners #라이프가이드 #건강정보 #건강습관
 */
export function generateDraft(setId: string): InstagramDraft {
  const info = getSetInfo(setId);
  const deck = loadDeck(setId) as CardNewsSet | null;

  const title = deck?.title ?? setId;

  const intro = buildIntroBlock(deck);
  const checklist = buildChecklist(deck);
  const closing = "저장해두고 필요할 때 다시 확인해보세요.";
  const hashtags = "#TYLifePartners #라이프가이드 #건강정보 #건강습관";

  const caption = [
    "오늘의 라이프 가이드",
    "",
    intro,
    "",
    checklist,
    "",
    closing,
    "",
    hashtags,
  ].join("\n");

  // 절대 경로를 /output/... 형태의 웹 경로로 변환
  const imagePaths = info.imagePaths.map((p) => {
    const parts = p.split(path.sep);
    const outputIdx = parts.lastIndexOf("output");
    if (outputIdx >= 0) {
      return "/" + parts.slice(outputIdx).join("/");
    }
    return path.basename(p);
  });

  return { setId, title, caption, imagePaths };
}

// ── 캡션 빌더 유틸 ────────────────────────────────────────────────────────────

function buildIntroBlock(deck: CardNewsSet | null): string {
  // 우선순위: 1) 표지 소제목  2) 첫 콘텐츠 카드의 intro  3) 표지 제목 줄
  if (deck?.cover?.subtitle) {
    return deck.cover.subtitle.trim();
  }
  const firstIntro = deck?.cards?.[0]?.intro?.trim();
  if (firstIntro) {
    return firstIntro;
  }
  const coverLines = deck?.cover?.titleLines ?? [];
  if (coverLines.length) {
    return coverLines.map((l) => l.trim()).filter(Boolean).join("\n");
  }
  return deck?.title ?? "오늘 알아두면 좋은 건강 정보를 확인해보세요.";
}

function buildChecklist(deck: CardNewsSet | null): string {
  if (!deck?.cards?.length) {
    return ["✔ 건강한 생활습관", "✔ 전문 건강정보", "✔ TY Life Partners 제공"].join(
      "\n"
    );
  }
  const items: string[] = [];
  // 컨텐츠 카드 중 마무리 카드(흔히 마지막)를 제외한 앞쪽 카드 제목을 우선 사용
  const candidates = deck.cards.slice(0, Math.min(3, deck.cards.length));
  for (const card of candidates) {
    const t = (card.title ?? "").trim();
    if (t) items.push(`✔ ${t}`);
  }
  // 비어 있으면 highlight/intro로 폴백
  if (!items.length) {
    for (const card of deck.cards.slice(0, 3)) {
      const h = (card.highlights?.[0] ?? card.intro ?? "").trim();
      if (h) items.push(`✔ ${shorten(h, 28)}`);
    }
  }
  // 그래도 비어있으면 기본값
  if (!items.length) {
    return ["✔ 건강한 생활습관", "✔ 전문 건강정보", "✔ TY Life Partners 제공"].join(
      "\n"
    );
  }
  return items.join("\n");
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/[ \t,，.]+$/, "") + "…";
}
