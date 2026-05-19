import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import * as fs from "fs";
import * as path from "path";

import * as dotenv from "dotenv";
import { KdcaContent } from "../types/cardnews";
import { ensureDir } from "../utils/fs";

dotenv.config();

// ── 상수 ───────────────────────────────────────────────────────────────────
const KDCA_VIEW_URL =
  "https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsView.do";

const KDCA_REFERER =
  "https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsMain.do";

const REQUEST_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: KDCA_REFERER,
  "Content-Type": "application/x-www-form-urlencoded",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9",
};

const MIN_CONTENT_LENGTH = 100; // rawText 최소 길이 (자)
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

// 노이즈 제거 대상 선택자
// form은 제외: KDCA 페이지는 콘텐츠 전체를 form 내부에 포함함
const NOISE_SELECTORS =
  "script, style, nav, footer, header, button, " +
  ".gnb, .lnb, .snb, .breadcrumb, .btn, .pagination, .share, .print, " +
  ".sub-visual, .font-size-wrap, .board-util, .relate-info, " +
  "#header, #footer, #gnb, #lnb, " +
  "input[type='hidden'], select";

// 콘텐츠 루트 후보 (앞쪽이 우선순위 높음)
const CONTENT_ROOT_SELECTORS = [
  ".board-contents",   // 질병관리청 이달의 건강정보
  ".cont",
  ".content",
  ".view-cont",
  ".view-body",
  ".detail-cont",
  "article",
  "main",
];

// 제목 후보 선택자 (콘텐츠 루트 내부 우선 → 전체 문서 fallback)
const TITLE_SELECTORS = [
  ".board-contents h4",    // 질병관리청 이달의 건강정보
  ".board-contents h3",
  ".view-title",
  ".cont-tit",
  ".board-tit",
  ".detail-tit",
  ".view-tit",
  ".title",
  ".tit",
];

// ── 내부 유틸리티 ──────────────────────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveDebugHtml(html: string, contentId: string): void {
  try {
    const debugDir = path.resolve(
      process.env["OUTPUT_DIR"] ?? "output",
      "debug"
    );
    ensureDir(debugDir);
    const filePath = path.join(debugDir, `kdca-${contentId}.html`);
    fs.writeFileSync(filePath, html, "utf-8");
    console.log(`[KdcaScraper] 디버그 HTML 저장됨: ${filePath}`);
  } catch {
    // 디버그 저장 실패는 파이프라인을 중단시키지 않음
  }
}

function cleanText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// ── HTTP 요청 ──────────────────────────────────────────────────────────────
async function postWithRetry(
  url: string,
  body: URLSearchParams
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1) {
      console.log(
        `[KdcaScraper] 재시도 ${attempt - 1}/${MAX_RETRIES} (${RETRY_DELAY_MS}ms 대기 중...)`
      );
      await delay(RETRY_DELAY_MS);
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: REQUEST_HEADERS,
        body: body.toString(),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      return await res.text();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[KdcaScraper] 요청 실패 (시도 ${attempt}/${MAX_RETRIES + 1}): ${lastError.message}`
      );
    }
  }

  throw lastError ?? new Error("알 수 없는 오류");
}

// ── HTML 파싱 ──────────────────────────────────────────────────────────────
function extractTitle($: cheerio.CheerioAPI): string {
  for (const sel of TITLE_SELECTORS) {
    const text = cleanText($(sel).first().text());
    if (text.length >= 2 && text.length <= 120) return text;
  }
  return "제목 없음";
}

function findContentRoot(
  $: cheerio.CheerioAPI
): cheerio.Cheerio<AnyNode> {
  for (const sel of CONTENT_ROOT_SELECTORS) {
    const $el = $(sel).first();
    if ($el.length && $el.text().trim().length >= MIN_CONTENT_LENGTH) {
      return $el;
    }
  }
  return $("body");
}

function extractSections(
  $: cheerio.CheerioAPI
): { heading?: string; body: string }[] {
  // 노이즈 제거는 parseKdcaHtml에서 먼저 수행됨

  const $root = findContentRoot($);
  const sections: { heading?: string; body: string }[] = [];
  let currentHeading: string | undefined;
  let currentBodies: string[] = [];

  function flush(): void {
    const body = currentBodies.join(" ").replace(/\s+/g, " ").trim();
    if (body.length >= 5 || currentHeading) {
      sections.push({ heading: currentHeading, body });
    }
    currentBodies = [];
    currentHeading = undefined;
  }

  // 헤딩(h1~h4)과 텍스트 단락을 문서 순서대로 순회
  $root.find("h1, h2, h3, h4, p, li, dd, dt").each((_, el) => {
    const $el = $(el);

    // 자식에 p/li가 있는 컨테이너 노드는 건너뜀 (중복 텍스트 방지)
    if ($el.find("p, li").length > 0) return;

    const tagName = String($el.prop("tagName") ?? "").toLowerCase();
    const text = cleanText($el.text());
    if (!text || text.length < 3) return;

    if (["h1", "h2", "h3", "h4"].includes(tagName)) {
      flush();
      currentHeading = text;
    } else {
      currentBodies.push(text);
    }
  });

  flush();

  // fallback 1: 콘텐츠 루트 전체 텍스트를 단락으로 분할
  // KDCA처럼 <p><p>...</p></p> 중첩 구조로 위 탐색이 0개를 반환할 경우 사용
  if (sections.length === 0) {
    const fullText = $root.text().replace(/[ \t]+/g, " ").trim();
    fullText
      .split(/\n{2,}/)
      .map((p) => cleanText(p))
      .filter((p) => p.length >= 10)
      .forEach((body) => sections.push({ body }));
  }

  // fallback 2: 콘텐츠 루트 전체를 단일 섹션으로 (최후 수단)
  if (sections.length === 0) {
    const text = cleanText($root.text());
    if (text.length >= 10) sections.push({ body: text });
  }

  return sections;
}

function parseKdcaHtml(html: string, contentId: string): KdcaContent {
  const $ = cheerio.load(html);

  // 노이즈 제거를 타이틀/섹션 추출보다 먼저 수행
  $(NOISE_SELECTORS).remove();

  const title = extractTitle($);
  const sections = extractSections($);
  const rawText = sections
    .map((s) => [s.heading, s.body].filter(Boolean).join("\n"))
    .join("\n\n");

  if (rawText.length < MIN_CONTENT_LENGTH) {
    console.warn(
      `[KdcaScraper] 경고: rawText가 너무 짧습니다 (${rawText.length}자). ` +
        `HTML 구조가 예상과 다를 수 있습니다.`
    );
    saveDebugHtml(html, contentId);
  } else {
    console.log(
      `[KdcaScraper] 파싱 완료 — 섹션: ${sections.length}개, rawText: ${rawText.length}자`
    );
  }

  return {
    contentId,
    sourceUrl: `${KDCA_VIEW_URL}?thtimt_cntnts_sn=${contentId}`,
    title,
    sections,
    rawText,
  };
}

// ── 공개 API ───────────────────────────────────────────────────────────────

/**
 * 질병관리청 국가건강정보포털에서 콘텐츠를 가져옵니다.
 * 실패 시 MAX_RETRIES 횟수만큼 재시도하고, 그래도 실패하면 에러를 throw합니다.
 */
export async function fetchKdcaContent(
  contentId: string | number
): Promise<KdcaContent> {
  const id = String(contentId);

  console.log(`[KdcaScraper] 요청 시작 — contentId=${id}`);

  const formBody = new URLSearchParams({
    thtimt_cntnts_sn: id,
    searchTy: "U",
    pageIndex: "1",
  });

  const html = await postWithRetry(KDCA_VIEW_URL, formBody);
  const result = parseKdcaHtml(html, id);

  console.log(`[KdcaScraper] 완료 — 제목: "${result.title}"`);
  return result;
}

/**
 * 크롤링이 불가능할 때 원문 텍스트를 직접 넣어 KdcaContent 형태로 변환합니다.
 */
export function createKdcaContentFromText(params: {
  contentId?: string;
  title: string;
  rawText: string;
  sourceUrl?: string;
}): KdcaContent {
  const { contentId = "manual", title, rawText, sourceUrl } = params;

  const sections = rawText
    .split(/\n{2,}/)
    .map((p) => cleanText(p))
    .filter((p) => p.length >= 5)
    .map((body) => ({ body }));

  return {
    contentId,
    sourceUrl:
      sourceUrl ??
      `${KDCA_VIEW_URL}?thtimt_cntnts_sn=${contentId}`,
    title,
    sections,
    rawText: cleanText(rawText.replace(/\n{3,}/g, "\n\n")),
  };
}
