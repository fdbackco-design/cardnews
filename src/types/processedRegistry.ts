/** 이미지 공급자별 카드 수 (표지 + 내용 카드 합계) */
export type ImageProviderSummary = {
  gemini: number;
  pexels: number;
  local: number;
};

export type ProcessedAuditStatus = "ok" | "warn" | "fail";

/** contentId(thtimt_cntnts_sn) 단위 처리 이력 */
export type ProcessedContentEntry = {
  contentId: string;
  title: string;
  processedAt: string;
  outputDir: string;
  deckId: string;
  runId?: string;
  imageSummary?: ImageProviderSummary;
  auditStatus?: ProcessedAuditStatus;
};

export type ProcessedContentRegistry = {
  version: 1;
  entries: Record<string, ProcessedContentEntry>;
};
