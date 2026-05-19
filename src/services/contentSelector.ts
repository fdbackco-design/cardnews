import type { KdcaListItem } from "../types/cardnews";
import { fetchKdcaList } from "./kdcaListScraper";
import { loadProcessedIds } from "./processedContentRegistry";

export type PickNextUnprocessedOptions = {
  /** 목록 수집 최대 페이지 (기본: DAILY_MAX_PAGES 또는 6) */
  maxPages?: number;
  /** 이미 처리한 contentId (미지정 시 registry에서 로드) */
  processedIds?: Set<string>;
};

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

  const next = items.find((item) => !processedIds.has(item.contentId));

  if (!next) {
    console.log(
      `[ContentSelector] 미처리 글 없음 (목록 ${items.length}건 모두 처리됨)`,
    );
    return null;
  }

  console.log(
    `[ContentSelector] 다음 제작 대상: contentId=${next.contentId} "${next.title}"` +
      (next.publishMonth ? ` (${next.publishMonth})` : ""),
  );
  return next;
}
