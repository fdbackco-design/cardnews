import type { KdcaListItem } from "../types/cardnews";
import { fetchKdcaList } from "./kdcaListScraper";
import { loadProcessedIds } from "./processedContentRegistry";

export type PickNextUnprocessedOptions = {
  /** 목록 수집 최대 페이지 (기본: DAILY_MAX_PAGES 또는 6) */
  maxPages?: number;
  /** 이미 처리한 contentId (미지정 시 registry에서 로드) */
  processedIds?: Set<string>;
};

/**
 * 제목에 "1월"~"12월" 라벨이 포함되어 있는지 검사한다.
 *
 * - 숫자 바로 앞에 다른 숫자가 있으면 제외 (예: "150월" → false)
 * - 1월~9월, 10월~12월 모두 매칭
 */
const MONTH_LABEL_RE = /(?<![0-9])(1[0-2]|[1-9])월/;

function containsMonthLabel(title: string): boolean {
  return MONTH_LABEL_RE.test(title);
}

/**
 * 제목 기반 스킵 사유 — 매칭 시 사유 라벨 반환, 아니면 null.
 */
function getTitleSkipReason(title: string): string | null {
  if (containsMonthLabel(title)) return "월 라벨 포함";
  if (/코로나/.test(title)) return "코로나 단어 포함";
  return null;
}

function resolveMaxPages(override?: number): number {
  if (override !== undefined) return override;
  const fromEnv = process.env["DAILY_MAX_PAGES"];
  if (fromEnv) {
    const n = parseInt(fromEnv, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 6;
}

/**
 * KDCA 목록(최신순)에서 아직 카드뉴스로 제작하지 않은 첫 번째 글을 반환한다.
 */
export async function pickNextUnprocessedItem(
  options?: PickNextUnprocessedOptions,
): Promise<KdcaListItem | null> {
  const maxPages     = resolveMaxPages(options?.maxPages);
  const processedIds = options?.processedIds ?? loadProcessedIds();

  console.log(`[ContentSelector] 처리 이력: ${processedIds.size}건 스킵 대상`);
  console.log(`[ContentSelector] 목록 수집 (최신순, 최대 ${maxPages}페이지)...`);

  const items = await fetchKdcaList({ maxPages, sort: "latest" });

  if (items.length === 0) {
    console.warn("[ContentSelector] KDCA 목록이 비어 있습니다.");
    return null;
  }

  let titleSkipped = 0;
  const next = items.find((item) => {
    if (processedIds.has(item.contentId)) return false;
    const reason = getTitleSkipReason(item.title);
    if (reason) {
      titleSkipped += 1;
      console.log(
        `[ContentSelector] ${reason} — 건너뜀: contentId=${item.contentId} "${item.title}"`,
      );
      return false;
    }
    return true;
  });

  if (titleSkipped > 0) {
    console.log(
      `[ContentSelector] 제목 필터로 ${titleSkipped}건 건너뜀 (월 라벨 / 코로나 포함 제외).`,
    );
  }

  if (!next) {
    console.log(
      `[ContentSelector] 미처리 글 없음 (목록 ${items.length}건 — 처리완료/제목 필터 제외)`,
    );
    return null;
  }

  console.log(
    `[ContentSelector] 다음 제작 대상: contentId=${next.contentId} "${next.title}"` +
      (next.publishMonth ? ` (${next.publishMonth})` : ""),
  );
  return next;
}
