import type { CardNewsSet } from "../types/cardnews";
import type { ImageAuditReport, ImageCardAudit, ImageCardAuditStatus } from "../types/imageAudit";
import type { ImageProviderSummary, ProcessedAuditStatus } from "../types/processedRegistry";
import type { PromptLogEntry } from "../services/image/imageProvider";

const STOPWORDS_KO = new Set([
  "그리고", "하지만", "때문", "있습니다", "합니다", "입니다", "하는", "되는",
  "대한", "관련", "경우", "통해", "위해", "있는", "없는", "이런", "저런",
]);

// ── 키워드 추출 ───────────────────────────────────────────────────────────────

function extractKeywords(...texts: (string | undefined)[]): string[] {
  const combined = texts.filter(Boolean).join(" ");
  const keywords = new Set<string>();

  const koMatches = combined.match(/[가-힣]{2,}/g) ?? [];
  for (const w of koMatches) {
    if (w.length >= 2 && !STOPWORDS_KO.has(w)) keywords.add(w);
  }

  const enMatches = combined.match(/[a-zA-Z]{3,}/g) ?? [];
  for (const w of enMatches) {
    keywords.add(w.toLowerCase());
  }

  return [...keywords].slice(0, 12);
}

// ── 카드별 감사 ───────────────────────────────────────────────────────────────

function auditCard(
  entry: PromptLogEntry,
  deck: CardNewsSet,
): ImageCardAudit {
  const isCover = entry.cardType === "cover";
  const contentCard = !isCover
    ? deck.cards.find((c) => c.index + 1 === entry.cardIndex)
    : undefined;

  const title = isCover ? deck.title : (contentCard?.title ?? entry.title);
  const keywords = extractKeywords(
    deck.topic,
    title,
    contentCard?.intro,
    entry.subtitle,
  );

  const promptLower = entry.prompt.toLowerCase();
  const topicLower  = deck.topic.toLowerCase();

  const flags: string[] = [];
  let score = 70;

  if (keywords.length > 0) {
    const matched = keywords.filter(
      (kw) =>
        promptLower.includes(kw.toLowerCase()) ||
        topicLower.includes(kw.toLowerCase()),
    );
    const ratio = matched.length / keywords.length;
    score += Math.round(ratio * 25);
    if (ratio < 0.25) flags.push("low_keyword_match");
    if (!promptLower.includes(topicLower) && topicLower.length >= 2) {
      flags.push("topic_missing_in_prompt");
    }
  }

  const provider = entry.provider;
  if (provider === "pexels") {
    score -= 20;
    flags.push("pexels_fallback");
  } else if (provider === "local") {
    score -= 50;
    flags.push("local_fallback");
  }

  if (entry.cached) flags.push("gemini_cached");

  score = Math.max(0, Math.min(100, score));

  let status: ImageCardAuditStatus = "ok";
  if (provider === "local") status = "fail";
  else if (provider === "pexels" || score < 50) status = "warn";

  return {
    cardIndex: entry.cardIndex,
    cardType: entry.cardType,
    title,
    provider,
    cached: entry.cached,
    relevanceScore: score,
    relevanceFlags: flags,
    status,
  };
}

// ── 공급자 요약 ───────────────────────────────────────────────────────────────

export function summarizeImageProviders(
  promptLog: PromptLogEntry[],
): ImageProviderSummary {
  const summary: ImageProviderSummary = { gemini: 0, pexels: 0, local: 0 };
  for (const entry of promptLog) {
    if (entry.provider === "gemini") summary.gemini++;
    else if (entry.provider === "pexels") summary.pexels++;
    else summary.local++;
  }
  return summary;
}

function resolveOverallStatus(cards: ImageCardAudit[]): ProcessedAuditStatus {
  if (cards.some((c) => c.status === "fail")) return "fail";
  if (cards.some((c) => c.status === "warn")) return "warn";
  return "ok";
}

// ── 리포트 생성 ───────────────────────────────────────────────────────────────

export function buildImageAuditReport(params: {
  deck: CardNewsSet;
  promptLog: PromptLogEntry[];
  contentId?: string;
  runId: string;
}): ImageAuditReport {
  const { deck, promptLog, contentId, runId } = params;
  const cards = promptLog.map((entry) => auditCard(entry, deck));
  const imageSummary = summarizeImageProviders(promptLog);
  const overallScore =
    cards.length > 0
      ? Math.round(cards.reduce((s, c) => s + c.relevanceScore, 0) / cards.length)
      : 0;

  return {
    contentId,
    deckId: deck.id,
    topic: deck.topic,
    runId,
    generatedAt: new Date().toISOString(),
    imageSummary,
    cards,
    overallScore,
    overallStatus: resolveOverallStatus(cards),
  };
}

export function printImageAuditSummary(report: ImageAuditReport): void {
  const { imageSummary, overallStatus, overallScore } = report;
  console.log("\n[ImageAudit] 요약");
  console.log(
    `  공급자: gemini=${imageSummary.gemini} pexels=${imageSummary.pexels} local=${imageSummary.local}`,
  );
  console.log(`  적합성: ${overallStatus} (평균 점수 ${overallScore})`);

  for (const card of report.cards) {
    const label = card.cardType === "cover" ? "표지" : `카드 ${card.cardIndex - 1}`;
    const flags =
      card.relevanceFlags.length > 0 ? ` [${card.relevanceFlags.join(", ")}]` : "";
    console.log(
      `  [${label}] ${card.provider} score=${card.relevanceScore} ${card.status}${flags}`,
    );
  }
}
