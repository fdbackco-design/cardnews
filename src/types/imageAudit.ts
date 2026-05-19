import type { ImageProviderSummary, ProcessedAuditStatus } from "./processedRegistry";

export type ImageCardAuditStatus = "ok" | "warn" | "fail";

export type ImageCardAudit = {
  cardIndex: number;
  cardType: "cover" | "content";
  title: string;
  provider: string;
  cached: boolean;
  relevanceScore: number;
  relevanceFlags: string[];
  status: ImageCardAuditStatus;
};

export type ImageAuditReport = {
  contentId?: string;
  deckId: string;
  topic: string;
  runId: string;
  generatedAt: string;
  imageSummary: ImageProviderSummary;
  cards: ImageCardAudit[];
  overallScore: number;
  overallStatus: ProcessedAuditStatus;
};
