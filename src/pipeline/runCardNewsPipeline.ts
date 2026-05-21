import * as path from "path";

import { captureCardsFromHtml } from "../generator/captureCards";
import { planCardNewsAsync } from "../generator/planCardNews";
import { assertDeckCopyQuality } from "../services/content/contentGenerator";
import { renderCardNewsHtml } from "../generator/renderHtml";
import { fetchKdcaContent } from "../services/kdcaScraper";
import { findBestKdcaItemByKeyword } from "../services/kdcaListScraper";
import {
  enrichCardNewsImages,
  type PromptLogEntry,
} from "../services/googleImageSearch";
import type { CardNewsSet, KdcaContent } from "../types/cardnews";
import { ensureOutputDirs, timestampedSlug } from "../utils/fs";

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type PipelineInput = {
  topic?: string;
  pattern: "narrative" | "list";
  cardCount?: number;
  contentId?: string;
  keyword?: string;
  capture?: boolean;
  /** contentId가 확정된 경우 keyword 목록 검색 생략 (daily batch용) */
  skipKdcaListSearch?: boolean;
};

export type PipelineResult = {
  deck: CardNewsSet;
  kdcaData?: KdcaContent;
  contentId?: string;
  topic: string;
  outputDir: string;
  htmlPath: string;
  imagePaths: string[];
  captured: boolean;
  promptLog: PromptLogEntry[];
};

// ── 콘솔 요약 ─────────────────────────────────────────────────────────────────

function printDeckSummary(deck: CardNewsSet): void {
  const total = deck.cards.length + 1;
  console.log("┌─────────────────────────────────────────┐");
  console.log(`│  ${deck.title.slice(0, 38).padEnd(38)}  │`);
  console.log("├─────────────────────────────────────────┤");
  console.log(`│  패턴  : ${deck.pattern.padEnd(31)}│`);
  console.log(`│  카드  : ${String(total).padEnd(31)}│`);
  console.log(`│  ID    : ${deck.id.slice(0, 31).padEnd(31)}│`);
  if (deck.sourceUrl) {
    const shortUrl = deck.sourceUrl.slice(-38);
    console.log(`│  출처  : ...${shortUrl.slice(0, 28).padEnd(28)}│`);
  }
  console.log("└─────────────────────────────────────────┘");
  console.log();

  console.log(`  [표지] ${deck.cover.titleLines.join(" | ")}`);
  if (deck.cover.subtitle) console.log(`         ${deck.cover.subtitle}`);
  console.log();

  deck.cards.forEach((card, i) => {
    const intro  = (card.intro ?? "").slice(0, 50);
    const suffix = (card.intro ?? "").length > 50 ? "…" : "";
    console.log(`  [${i + 2}/${total}] ${card.title}`);
    if (card.subtitle)   console.log(`        ${card.subtitle}`);
    console.log(`        ${intro}${suffix}`);
    if (card.highlights) card.highlights.forEach((h) => console.log(`        • ${h}`));
    if (card.bullets)    card.bullets.forEach((b)    => console.log(`        - ${b}`));
    console.log();
  });
}

// ── 파이프라인 ─────────────────────────────────────────────────────────────────

/**
 * 카드뉴스 생성 파이프라인 (KDCA 수집 → 기획 → 이미지 → HTML → PNG).
 * `src/index.ts` 및 daily batch entry에서 공통으로 사용한다.
 */
export async function runCardNewsPipeline(input: PipelineInput): Promise<PipelineResult> {
  let kdcaData: KdcaContent | undefined;
  let resolvedContentId = input.contentId;
  let resolvedTopic     = input.topic;

  // ── 1. 질병관리청 데이터 수집 ─────────────────────────────────────────────
  if (!resolvedContentId && input.keyword && !input.skipKdcaListSearch) {
    console.log(`[1/5] 목록에서 "${input.keyword}" 검색 중...`);
    try {
      const found = await findBestKdcaItemByKeyword(input.keyword);
      if (found) {
        resolvedContentId = found.contentId;
        resolvedTopic     = resolvedTopic ?? found.title;
        console.log(`[1/5] 게시물 발견: "${found.title}" (contentId=${found.contentId})`);
      } else {
        console.warn(`[1/5] 키워드 "${input.keyword}"로 게시물을 찾지 못했습니다 — 프리셋으로 전환`);
        resolvedTopic = resolvedTopic ?? input.keyword;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[1/5] 목록 검색 실패: ${msg} — 프리셋으로 전환`);
      resolvedTopic = resolvedTopic ?? input.keyword;
    }
  }

  if (resolvedContentId) {
    try {
      kdcaData = await fetchKdcaContent(resolvedContentId);
      resolvedTopic = resolvedTopic ?? kdcaData.title;
      console.log(`[1/5] 질병관리청 수집 완료`);
      console.log(`      "${kdcaData.title}" | ${kdcaData.sections.length}섹션 | ${kdcaData.rawText.length}자`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[1/5] 질병관리청 수집 실패 — 프리셋/템플릿으로 전환합니다.`);
      console.warn(`      원인: ${msg}`);
    }
  } else if (!input.keyword) {
    console.log(`[1/5] contentId/keyword 없음 — 프리셋/템플릿을 사용합니다.`);
  }

  const finalTopic = resolvedTopic ?? "건강 정보";

  // ── 2. 카드뉴스 기획 ─────────────────────────────────────────────────────
  console.log(`\n[2/5] 카드뉴스 기획 중 (콘텐츠 재작성)...`);
  const rawDeck = await planCardNewsAsync({
    topic:     finalTopic,
    pattern:   input.pattern,
    source:    kdcaData,
    contentId: resolvedContentId,
    cardCount: input.cardCount,
  });

  console.log(`[2/5] 카드뉴스 기획 완료`);
  if (kdcaData) {
    assertDeckCopyQuality(rawDeck.cards);
  }
  printDeckSummary(rawDeck);

  // ── 3. 이미지 검색 ────────────────────────────────────────────────────────
  console.log(`[3/5] 이미지 검색...`);
  const { deck, promptLog } = await enrichCardNewsImages(rawDeck);

  // ── 4. output 폴더 생성 + HTML 렌더링 ─────────────────────────────────────
  const baseOutputDir = path.resolve(
    process.env["OUTPUT_DIR"] ?? "./output",
    timestampedSlug(deck.topic)
  );
  ensureOutputDirs(baseOutputDir);
  console.log(`\n[4/5] 출력 폴더: ${baseOutputDir}`);

  const htmlPath = await renderCardNewsHtml(deck, baseOutputDir);
  console.log(`      HTML 저장: ${path.basename(htmlPath)}`);

  // ── 5. PNG 캡처 ───────────────────────────────────────────────────────────
  let imagePaths: string[] = [];
  const captured = Boolean(input.capture);

  if (input.capture) {
    console.log(`\n[5/5] PNG 캡처 시작...`);
    const totalCards = deck.cards.length + 1;
    const output = await captureCardsFromHtml(htmlPath, baseOutputDir, totalCards);
    imagePaths = output.imagePaths;

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  완료");
    console.log(`  HTML  : ${output.htmlPath}`);
    console.log(`  PNG   : ${output.imagePaths.length}장`);
    output.imagePaths.forEach((p) => console.log(`    ${path.basename(p)}`));
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  } else {
    console.log(`\n[5/5] 캡처 건너뜀 (--capture 플래그로 실행 시 PNG 생성)`);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  완료");
    console.log(`  HTML  : ${htmlPath}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  }

  return {
    deck,
    kdcaData,
    contentId: resolvedContentId,
    topic: finalTopic,
    outputDir: baseOutputDir,
    htmlPath,
    imagePaths,
    captured,
    promptLog,
  };
}
