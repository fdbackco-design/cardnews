export type CardNewsPattern = "narrative" | "list";

// ── 완성된 카드뉴스 세트 ─────────────────────────────────────────────────
export type CardNewsSet = {
  id: string;
  title: string;
  /** KDCA 원문 제목 원본 — 표지 제목 재작성과 분리해 보존 */
  originalTitle?: string;
  topic: string;
  pattern: CardNewsPattern;
  sourceUrl?: string;
  cover: CoverCard;
  cards: ContentCard[];
};

// ── 표지 카드 ────────────────────────────────────────────────────────────
export type CoverCard = {
  type: "cover";
  variant: "top" | "bottom";
  label: "라이프 가이드";
  titleLines: string[];
  /** Gemini가 재작성한 표지 제목(전체 문자열) — 디버깅·로깅 용도 */
  rewrittenCoverTitle?: string;
  subtitle?: string;
  imageQuery: string;
  imageUrl?: string;
};

// ── 내용 카드 ────────────────────────────────────────────────────────────
export type ContentCard = {
  type: "content";
  index: number;
  title: string;
  subtitle?: string;
  intro: string;
  highlights?: string[];
  bullets?: string[];
  outro?: string;
  imageQuery: string;
  imageUrl?: string;
};

// ── 질병관리청 원문 데이터 ───────────────────────────────────────────────
export type KdcaContent = {
  contentId: string;
  sourceUrl: string;
  title: string;
  sections: {
    heading?: string;
    body: string;
  }[];
  rawText: string;
  /** Gemini 재작성용 원문 HTML (li.content 등) */
  sourceHtml?: string;
};

// ── 파이프라인 입력값 ────────────────────────────────────────────────────
export type CardNewsInput = {
  contentId?: string;
  topic?: string;
  pattern: CardNewsPattern;
  sourceUrl?: string;
  rawText?: string;
};

// ── 최종 출력 경로 ───────────────────────────────────────────────────────
export type CardNewsOutput = {
  htmlPath: string;
  imagePaths: string[];
  debugDir: string;
};

// ── 질병관리청 목록 아이템 ─────────────────────────────────────────────
export type KdcaListItem = {
  contentId: string;        // thtimt_cntnts_sn (상세 POST 파라미터)
  title: string;
  relatedDiseases?: string;
  publishMonth?: string;    // YYYY-MM
  views?: number;
  pageIndex: number;
  sourceUrl: string;
};

export type KdcaListSearchOptions = {
  keyword?: string;
  maxPages?: number;
  sort?: "latest" | "views" | "title";
};
