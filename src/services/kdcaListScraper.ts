import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

import type { KdcaListItem, KdcaListSearchOptions } from "../types/cardnews";
import { ensureDir } from "../utils/fs";

dotenv.config();

// ── 상수 ────────────────────────────────────────────────────────────────────

const LIST_URL =
  "https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsMain.do";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: LIST_URL,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

// fn_goView('contentId', 'title') 패턴
const FN_GOVIEW_RE = /fn_goView\('(\d+)',\s*'([^']+)'\)/;

// ── 유틸 ────────────────────────────────────────────────────────────────────

/** YYYY-MM → YYYYMM 정수 (정렬용) */
function publishMonthToNumber(publishMonth?: string): number {
  if (!publishMonth) return 0;
  const n = parseInt(publishMonth.replace("-", ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

function sortByLatest(items: KdcaListItem[]): KdcaListItem[] {
  return [...items].sort((a, b) => {
    const monthDiff =
      publishMonthToNumber(b.publishMonth) - publishMonthToNumber(a.publishMonth);
    if (monthDiff !== 0) return monthDiff;
    // 같은 게시월이면 목록 앞쪽(낮은 pageIndex)이 더 최신
    if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
    return parseInt(a.contentId, 10) - parseInt(b.contentId, 10);
  });
}

function debugDir(): string {
  return path.resolve(process.env["OUTPUT_DIR"] ?? "output", "debug");
}

function saveDebug(filename: string, content: string): void {
  try {
    ensureDir(debugDir());
    fs.writeFileSync(path.join(debugDir(), filename), content, "utf-8");
  } catch {
    // 디버그 저장 실패는 파이프라인을 중단시키지 않음
  }
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 목록 페이지 HTML을 가져온다.
 * 1페이지: GET 시도 → 실패 시 POST fallback
 * 2페이지 이상: POST
 */
export async function fetchKdcaListPage(pageIndex = 1): Promise<string> {
  // 1페이지는 GET으로 먼저 시도
  if (pageIndex === 1) {
    try {
      const res = await fetch(LIST_URL, { headers: BASE_HEADERS });
      if (res.ok) {
        const html = await res.text();
        if (html.includes("fn_goView")) return html;
      }
    } catch {
      // fall through to POST
    }
  }

  const body = new URLSearchParams({
    pageIndex: String(pageIndex),
    searchTy:  "U",
  });

  const res = await fetch(LIST_URL, {
    method:  "POST",
    headers: { ...BASE_HEADERS, "Content-Type": "application/x-www-form-urlencoded" },
    body:    body.toString(),
  });

  if (!res.ok) {
    throw new Error(`[KdcaList] HTTP ${res.status} (pageIndex=${pageIndex})`);
  }

  return await res.text();
}

/**
 * 목록 페이지 HTML에서 KdcaListItem 배열을 추출한다.
 * contentId는 반드시 fn_goView() 인자에서 추출하며,
 * 목록 번호·조회수·게시년월을 contentId로 오인하지 않는다.
 */
export function parseKdcaListItems(html: string, pageIndex: number): KdcaListItem[] {
  const $ = cheerio.load(html);
  const items: KdcaListItem[] = [];

  $("table tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 4) return;

    // td[0] = 목록 번호 (contentId 아님, 무시)
    // td[1] = 제목 + fn_goView 링크
    // td[2] = 관련질병
    // td[3] = 게시년월
    // td[4] = 조회수

    const $titleTd = $(tds.get(1)!);
    const href     = $titleTd.find("a").attr("href") ?? "";
    const match    = FN_GOVIEW_RE.exec(href);

    if (!match) return; // fn_goView 없으면 skip

    const contentId       = match[1]!;
    const titleFromHref   = match[2]!;
    const titleFromText   = $titleTd.find("a").text().trim();
    const title           = titleFromText.length > 0 ? titleFromText : titleFromHref;

    const relatedRaw      = $(tds.get(2)!).text().trim().replace(/\s+/g, " ");
    const relatedDiseases = relatedRaw.length > 0 ? relatedRaw : undefined;

    const publishMonth    = $(tds.get(3)!).text().trim() || undefined;

    const viewsRaw        = $(tds.get(4)!).text().trim().replace(/,/g, "");
    const views           = viewsRaw.length > 0 ? parseInt(viewsRaw, 10) : undefined;

    items.push({
      contentId,
      title,
      relatedDiseases,
      publishMonth,
      views:     Number.isNaN(views) ? undefined : views,
      pageIndex,
      sourceUrl: `https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsView.do?thtimt_cntnts_sn=${contentId}`,
    });
  });

  // 파싱 결과 항상 저장
  saveDebug(`kdca-list-items-page-${pageIndex}.json`, JSON.stringify(items, null, 2));

  if (items.length === 0) {
    console.warn(`[KdcaList] 페이지 ${pageIndex}: contentId 추출 실패 — debug HTML 저장`);
    saveDebug(`kdca-list-page-${pageIndex}.html`, html);
  }

  return items;
}

/**
 * 여러 페이지를 순회하여 게시물 목록을 수집한다.
 * keyword 필터링, 중복 제거, 정렬을 지원한다.
 */
export async function fetchKdcaList(options?: KdcaListSearchOptions): Promise<KdcaListItem[]> {
  const { keyword, maxPages = 6, sort } = options ?? {};

  const allItems: KdcaListItem[] = [];
  const seenIds  = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    console.log(`[KdcaList] 페이지 ${page}/${maxPages} 수집 중...`);
    try {
      const html  = await fetchKdcaListPage(page);
      const items = parseKdcaListItems(html, page);

      if (items.length === 0) {
        console.log(`[KdcaList] 페이지 ${page}: 0개 — 수집 종료`);
        break;
      }

      for (const item of items) {
        if (!seenIds.has(item.contentId)) {
          seenIds.add(item.contentId);
          allItems.push(item);
        }
      }

      console.log(
        `[KdcaList] 페이지 ${page}: ${items.length}개 (누적 ${allItems.length}개)`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[KdcaList] 페이지 ${page} 수집 실패: ${msg}`);
      break;
    }
  }

  // 키워드 필터
  let result = allItems;
  if (keyword) {
    const kw = keyword.toLowerCase();
    result = allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(kw) ||
        (item.relatedDiseases ?? "").toLowerCase().includes(kw),
    );
    console.log(`[KdcaList] 키워드 "${keyword}" 필터 결과: ${result.length}개`);
  }

  // 정렬
  if (sort === "views") {
    result.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  } else if (sort === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title, "ko"));
  } else {
    // latest (기본): 게시월 내림차순 → 목록 페이지 순
    result = sortByLatest(result);
  }

  return result;
}

/**
 * 키워드로 가장 관련성 높은 게시물을 반환한다.
 *
 * 우선순위:
 * 1. title에 keyword 포함
 * 2. relatedDiseases에 keyword 포함
 * 3. title 앞부분 일치
 * 4. 최신 publishMonth
 * 5. views 높은 순
 */
export async function findBestKdcaItemByKeyword(
  keyword: string,
): Promise<KdcaListItem | null> {
  console.log(`[KdcaList] 키워드 검색 시작: "${keyword}"`);

  const items = await fetchKdcaList({ keyword });

  if (items.length === 0) {
    // keyword 필터 결과가 없으면 전체 목록에서 시도
    console.log(`[KdcaList] 필터 결과 없음 — 전체 목록에서 재검색`);
    const all = await fetchKdcaList({ maxPages: 6 });
    const kw  = keyword.toLowerCase();
    const fallback = all.find(
      (item) =>
        item.title.toLowerCase().includes(kw) ||
        (item.relatedDiseases ?? "").toLowerCase().includes(kw),
    );
    if (fallback) {
      console.log(`[KdcaList] fallback 결과: "${fallback.title}" (contentId=${fallback.contentId})`);
      return fallback;
    }
    console.log(`[KdcaList] "${keyword}" — 관련 게시물을 찾지 못했습니다.`);
    return null;
  }

  const kw = keyword.toLowerCase();

  const scored = items.map((item) => {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const relLower   = (item.relatedDiseases ?? "").toLowerCase();

    if (titleLower.includes(kw))      score += 100;
    if (relLower.includes(kw))        score += 50;
    if (titleLower.startsWith(kw))    score += 20;
    // 최신순 보너스 (YYYY-MM → 숫자로 비교)
    if (item.publishMonth) {
      score += parseInt(item.publishMonth.replace("-", ""), 10) / 100000;
    }
    // 조회수 보너스 (작은 값, 동점 해소용)
    score += (item.views ?? 0) / 1_000_000;

    return { item, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!.item;

  console.log(`[KdcaList] 최적 결과: "${best.title}" (contentId=${best.contentId}, 게시월=${best.publishMonth})`);
  return best;
}

// ── CLI 진입점 (npm run kdca:list) ──────────────────────────────────────────

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const keywordArg = args.find((a) => a.startsWith("--keyword="));
    const keyword    = keywordArg ? keywordArg.split("=")[1] : undefined;
    const pagesArg   = args.find((a) => a.startsWith("--pages="));
    const maxPages   = pagesArg ? parseInt(pagesArg.split("=")[1]!, 10) : 3;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  KDCA 이달의 건강정보 목록 수집");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (keyword) console.log(`  키워드: ${keyword}`);
    console.log(`  최대 페이지: ${maxPages}`);
    console.log();

    const items = await fetchKdcaList({ keyword, maxPages });

    if (items.length === 0) {
      console.log("  결과 없음");
    } else {
      items.forEach((item, i) => {
        console.log(`  [${String(i + 1).padStart(2, "0")}] contentId=${item.contentId.padEnd(5)} ${item.title}`);
        if (item.relatedDiseases) console.log(`        관련질병: ${item.relatedDiseases}`);
        console.log(`        게시월: ${item.publishMonth ?? "-"}  조회수: ${item.views ?? "-"}`);
      });
    }

    console.log(`\n  총 ${items.length}개`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  })().catch((err) => {
    console.error("[오류]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
