import * as path from "path";
import * as fs from "fs";

import { loadDeck, getSetInfo } from "./cardNewsEditor";
import type { CardNewsSet } from "../../types/cardnews";

export type InstagramDraft = {
  caption: string;
  imagePaths: string[];
};

export function generateDraft(setId: string): InstagramDraft {
  const info = getSetInfo(setId);
  const deck = loadDeck(setId) as CardNewsSet | null;

  const title = deck?.title ?? setId;
  const highlights: string[] = [];

  if (deck) {
    for (const card of deck.cards.slice(0, 3)) {
      if (card.highlights?.length) {
        highlights.push(...card.highlights.slice(0, 1));
      } else if (card.intro) {
        highlights.push(card.intro.slice(0, 40) + (card.intro.length > 40 ? "…" : ""));
      }
    }
  }

  const checklines = highlights.slice(0, 3).map((h) => `✔ ${h}`).join("\n");

  const caption = [
    `오늘의 라이프 가이드`,
    `${title}`,
    "",
    checklines || "✔ 건강한 생활습관\n✔ 전문 건강정보\n✔ TY Life Partners 제공",
    "",
    "#TYLifePartners #라이프가이드 #건강정보 #건강습관 #건강관리",
  ].join("\n");

  const relPaths = info.imagePaths.map((p) => {
    const parts = p.split(path.sep);
    const outputIdx = parts.lastIndexOf("output");
    return outputIdx >= 0 ? parts.slice(outputIdx).join("/") : path.basename(p);
  });

  return {
    caption,
    imagePaths: relPaths,
  };
}
