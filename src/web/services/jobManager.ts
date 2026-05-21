import { randomUUID } from "crypto";
import * as path from "path";
import * as fs from "fs";

import { findBestKdcaItemByKeyword } from "../../services/kdcaListScraper";
import { fetchKdcaContent } from "../../services/kdcaScraper";
import { planCardNewsAsync } from "../../generator/planCardNews";
import { assertDeckCopyQuality } from "../../services/content/contentGenerator";
import { enrichCardNewsImages } from "../../services/googleImageSearch";
import { renderCardNewsHtml } from "../../generator/renderHtml";
import { captureCardsFromHtml } from "../../generator/captureCards";
import { ensureOutputDirs, timestampedSlug, writeTextFile } from "../../utils/fs";
import { pickNextUnprocessedItem } from "../../services/contentSelector";
import { markProcessed } from "../../services/processedContentRegistry";
import { buildImageAuditReport } from "../../validation/imageAuditReport";
import type { KdcaContent } from "../../types/cardnews";

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type StepStatus = "waiting" | "running" | "success" | "failed" | "skipped";

export type JobStep = {
  id: number;
  name: string;
  status: StepStatus;
  message?: string;
  startedAt?: string;
  endedAt?: string;
};

export type GenerateInput = {
  mode: "kdca" | "custom-topic";
  // KDCA 모드
  keyword?: string;
  contentId?: string;
  autoSelect?: boolean;
  // 직접 주제 모드
  topic?: string;
  targetAudience?: string;
  cardCount?: number;
  tone?: string;
  referenceText?: string;
  // 공통
  capture?: boolean;
};

export type JobResult = {
  setId: string;
  title: string;
  outputDir: string;
  htmlPath: string;
  imagePaths: string[];
  batchReportPath?: string;
};

export type CardNewsJob = {
  id: string;
  status: "waiting" | "running" | "success" | "failed";
  mode: "kdca" | "custom-topic";
  currentStep: number;
  steps: JobStep[];
  input: GenerateInput;
  result?: JobResult;
  error?: string;
  logs: string[];
  createdAt: string;
  updatedAt: string;
};

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────

const STEP_NAMES = [
  "원문 자료 수집",
  "카드뉴스 기획",
  "이미지 생성",
  "HTML/CSS 렌더링",
  "Playwright 캡처",
  "결과 저장",
  "인스타그램 업로드 준비",
];

function makeInitialSteps(): JobStep[] {
  return STEP_NAMES.map((name, i) => ({
    id: i + 1,
    name,
    status: "waiting" as StepStatus,
  }));
}

function now(): string {
  return new Date().toISOString();
}

// ── Job 저장소 (인메모리) ──────────────────────────────────────────────────────

const jobStore = new Map<string, CardNewsJob>();

export function createJob(input: GenerateInput): CardNewsJob {
  const job: CardNewsJob = {
    id: `job_${randomUUID().slice(0, 8)}`,
    status: "waiting",
    mode: input.mode,
    currentStep: 0,
    steps: makeInitialSteps(),
    input,
    logs: [],
    createdAt: now(),
    updatedAt: now(),
  };
  jobStore.set(job.id, job);
  return job;
}

export function getJob(jobId: string): CardNewsJob | undefined {
  return jobStore.get(jobId);
}

export function listJobs(): CardNewsJob[] {
  return [...jobStore.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt)
  );
}

// ── 내부 상태 업데이트 ─────────────────────────────────────────────────────────

function updateJob(job: CardNewsJob): void {
  job.updatedAt = now();
  jobStore.set(job.id, job);
}

function startStep(job: CardNewsJob, stepId: number, message?: string): void {
  const step = job.steps[stepId - 1];
  if (!step) return;
  step.status = "running";
  step.startedAt = now();
  if (message) step.message = message;
  job.currentStep = stepId;
  addLog(job, `[Step ${stepId}] ${step.name} 시작${message ? `: ${message}` : ""}`);
  updateJob(job);
}

function completeStep(job: CardNewsJob, stepId: number, message?: string): void {
  const step = job.steps[stepId - 1];
  if (!step) return;
  step.status = "success";
  step.endedAt = now();
  if (message) step.message = message;
  addLog(job, `[Step ${stepId}] ${step.name} 완료${message ? `: ${message}` : ""}`);
  updateJob(job);
}

function skipStep(job: CardNewsJob, stepId: number, message?: string): void {
  const step = job.steps[stepId - 1];
  if (!step) return;
  step.status = "skipped";
  step.startedAt = now();
  step.endedAt = now();
  if (message) step.message = message;
  addLog(job, `[Step ${stepId}] ${step.name} 건너뜀${message ? `: ${message}` : ""}`);
  updateJob(job);
}

function failStep(job: CardNewsJob, stepId: number, error: string): void {
  const step = job.steps[stepId - 1];
  if (!step) return;
  step.status = "failed";
  step.endedAt = now();
  step.message = error;
  job.status = "failed";
  job.error = error;
  addLog(job, `[Step ${stepId}] ${step.name} 실패: ${error}`);
  updateJob(job);
}

function addLog(job: CardNewsJob, msg: string): void {
  const ts = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  job.logs.push(`[${ts}] ${msg}`);
  if (job.logs.length > 500) job.logs = job.logs.slice(-500);
}

// ── 웹 파이프라인 실행 ─────────────────────────────────────────────────────────

export function startJob(jobId: string): void {
  const job = jobStore.get(jobId);
  if (!job) return;
  job.status = "running";
  updateJob(job);
  runPipeline(job).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    if (job.status !== "failed") {
      job.status = "failed";
      job.error = msg;
      addLog(job, `[오류] ${msg}`);
      updateJob(job);
    }
  });
}

async function runPipeline(job: CardNewsJob): Promise<void> {
  const { input } = job;
  const capture = input.capture !== false;

  let kdcaData: KdcaContent | undefined;
  let resolvedContentId: string | undefined = input.contentId;
  let resolvedTopic: string | undefined = input.topic;

  // ── Step 1: 원문 자료 수집 ──────────────────────────────────────────────────

  if (input.mode === "custom-topic") {
    resolvedTopic = input.topic ?? "건강 정보";
    skipStep(job, 1, `직접 주제 입력: ${resolvedTopic}`);
  } else {
    startStep(job, 1, "KDCA 국가건강정보포털에서 데이터 수집 중...");
    try {
      if (!resolvedContentId && input.autoSelect) {
        addLog(job, "다음 미제작 KDCA 글 자동 선택 중...");
        const next = await pickNextUnprocessedItem();
        if (!next) {
          failStep(job, 1, "처리할 신규 KDCA 글이 없습니다.");
          return;
        }
        resolvedContentId = next.contentId;
        resolvedTopic = resolvedTopic ?? next.title;
        addLog(job, `선택: "${next.title}" (contentId=${next.contentId})`);
      } else if (!resolvedContentId && input.keyword) {
        addLog(job, `키워드 "${input.keyword}" 로 KDCA 목록 검색 중...`);
        const found = await findBestKdcaItemByKeyword(input.keyword);
        if (found) {
          resolvedContentId = found.contentId;
          resolvedTopic = resolvedTopic ?? found.title;
          addLog(job, `발견: "${found.title}" (contentId=${found.contentId})`);
        } else {
          addLog(job, `키워드 "${input.keyword}" 로 게시물을 찾지 못했습니다. 프리셋으로 전환합니다.`);
          resolvedTopic = resolvedTopic ?? input.keyword;
        }
      }

      if (resolvedContentId) {
        addLog(job, `contentId=${resolvedContentId} 본문 수집 중...`);
        kdcaData = await fetchKdcaContent(resolvedContentId);
        resolvedTopic = resolvedTopic ?? kdcaData.title;
        completeStep(job, 1, `"${kdcaData.title}" | ${kdcaData.sections.length}섹션`);
      } else {
        completeStep(job, 1, "직접 주제로 진행");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failStep(job, 1, msg);
      return;
    }
  }

  const finalTopic = resolvedTopic ?? "건강 정보";

  // ── Step 2: 카드뉴스 기획 ──────────────────────────────────────────────────

  startStep(job, 2, "Gemini로 카드뉴스 구성 기획 중...");
  let rawDeck;
  try {
    rawDeck = await planCardNewsAsync({
      topic: finalTopic,
      pattern: "narrative",
      source: kdcaData,
      contentId: resolvedContentId,
      cardCount: input.cardCount,
      // custom-topic 전용 — 원문 없이 Gemini 창작에 사용
      targetAudience: input.mode === "custom-topic" ? input.targetAudience : undefined,
      tone: input.mode === "custom-topic" ? input.tone : undefined,
      referenceText: input.mode === "custom-topic" ? input.referenceText : undefined,
    });
    if (kdcaData) {
      assertDeckCopyQuality(rawDeck.cards);
    }
    completeStep(job, 2, `"${rawDeck.title}" | ${rawDeck.cards.length + 1}장`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failStep(job, 2, msg);
    return;
  }

  // ── Step 3: 이미지 생성 ───────────────────────────────────────────────────

  startStep(job, 3, "이미지 검색/생성 중...");
  let deck;
  let promptLog;
  try {
    const result = await enrichCardNewsImages(rawDeck);
    deck = result.deck;
    promptLog = result.promptLog;
    const provider = process.env["IMAGE_PROVIDER"] ?? "hybrid";
    completeStep(job, 3, `${deck.cards.length + 1}장 이미지 처리 완료 (${provider})`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failStep(job, 3, msg);
    return;
  }

  // ── Step 4: HTML/CSS 렌더링 ───────────────────────────────────────────────

  startStep(job, 4, "HTML 카드뉴스 렌더링 중...");
  let outputDir: string;
  let htmlPath: string;
  try {
    outputDir = path.resolve(
      process.env["OUTPUT_DIR"] ?? "./output",
      timestampedSlug(deck.topic)
    );
    ensureOutputDirs(outputDir);
    htmlPath = await renderCardNewsHtml(deck, outputDir);
    completeStep(job, 4, `${path.basename(htmlPath)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failStep(job, 4, msg);
    return;
  }

  // ── Step 5: Playwright 캡처 ───────────────────────────────────────────────

  let imagePaths: string[] = [];
  if (capture) {
    startStep(job, 5, "PNG 이미지 캡처 중...");
    try {
      const totalCards = deck.cards.length + 1;
      const capResult = await captureCardsFromHtml(htmlPath, outputDir, totalCards);
      imagePaths = capResult.imagePaths;
      completeStep(job, 5, `${imagePaths.length}장 PNG 저장 완료`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failStep(job, 5, msg);
      return;
    }
  } else {
    skipStep(job, 5, "캡처 건너뜀 (capture=false)");
  }

  // ── Step 6: 결과 저장 ─────────────────────────────────────────────────────

  startStep(job, 6, "deck.json 및 batch-report 저장 중...");
  let batchReportPath: string | undefined;
  const setId = path.basename(outputDir);
  try {
    const deckJson = {
      ...deck,
      _webMeta: {
        setId,
        source: input.mode,
        contentId: resolvedContentId,
        createdAt: now(),
        imagePaths: imagePaths.map((p) => path.basename(p)),
      },
    };
    writeTextFile(path.join(outputDir, "deck.json"), JSON.stringify(deckJson, null, 2));

    if (input.mode === "kdca" && resolvedContentId) {
      const runId = job.id;
      const audit = buildImageAuditReport({
        deck,
        promptLog,
        contentId: resolvedContentId,
        runId,
      });
      batchReportPath = path.join(outputDir, "batch-report.json");
      writeTextFile(batchReportPath, JSON.stringify(audit, null, 2));
    }

    completeStep(job, 6, `setId: ${setId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failStep(job, 6, msg);
    return;
  }

  // ── Step 7: 인스타그램 업로드 준비 ────────────────────────────────────────

  startStep(job, 7, "캡션 초안 생성 및 registry 업데이트 중...");
  try {
    if (input.mode === "kdca" && resolvedContentId) {
      markProcessed({
        contentId: resolvedContentId,
        title: deck.title,
        processedAt: now(),
        outputDir,
        deckId: deck.id,
        runId: job.id,
        imageSummary: {} as never,
        auditStatus: "ok" as never,
      });
      addLog(job, `processed-content registry 업데이트 완료`);
    }
    completeStep(job, 7, "인스타그램 업로드 준비 완료");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Step 7 실패는 치명적이지 않으므로 job 자체는 성공 처리
    addLog(job, `[Step 7 경고] ${msg}`);
    completeStep(job, 7, `완료 (경고: ${msg})`);
  }

  // ── 최종 완료 ─────────────────────────────────────────────────────────────

  job.status = "success";
  job.result = {
    setId,
    title: deck.title,
    outputDir,
    htmlPath,
    imagePaths,
    batchReportPath,
  };
  addLog(job, `✅ 카드뉴스 생성 완료: ${deck.title}`);
  updateJob(job);
}
