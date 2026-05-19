import * as fs from "fs";
import * as path from "path";

import type {
  ProcessedContentEntry,
  ProcessedContentRegistry,
} from "../types/processedRegistry";
import { ensureDir } from "../utils/fs";

const REGISTRY_VERSION = 1 as const;
const DEFAULT_REGISTRY_PATH = path.resolve("data", "processed-content.json");

function getRegistryPath(): string {
  const fromEnv = process.env["PROCESSED_REGISTRY_PATH"]?.trim();
  return fromEnv
    ? path.resolve(fromEnv)
    : DEFAULT_REGISTRY_PATH;
}

function emptyRegistry(): ProcessedContentRegistry {
  return { version: REGISTRY_VERSION, entries: {} };
}

function isValidEntry(value: unknown): value is ProcessedContentEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e["contentId"] === "string" &&
    typeof e["title"] === "string" &&
    typeof e["processedAt"] === "string" &&
    typeof e["outputDir"] === "string" &&
    typeof e["deckId"] === "string"
  );
}

function parseRegistry(raw: string): ProcessedContentRegistry {
  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("registry root must be an object");
  }

  const root = parsed as Record<string, unknown>;
  if (root["version"] !== REGISTRY_VERSION) {
    throw new Error(`unsupported registry version: ${String(root["version"])}`);
  }

  const entriesRaw = root["entries"];
  if (!entriesRaw || typeof entriesRaw !== "object" || Array.isArray(entriesRaw)) {
    throw new Error("entries must be an object");
  }

  const entries: Record<string, ProcessedContentEntry> = {};
  for (const [key, value] of Object.entries(entriesRaw)) {
    if (!isValidEntry(value)) {
      console.warn(`[Registry] 잘못된 항목 스킵: key=${key}`);
      continue;
    }
    entries[value.contentId] = value;
  }

  return { version: REGISTRY_VERSION, entries };
}

function backupCorruptFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bakPath = `${filePath}.corrupt-${stamp}.bak`;
  try {
    fs.copyFileSync(filePath, bakPath);
    console.warn(`[Registry] 손상 파일 백업: ${bakPath}`);
  } catch {
    // 백업 실패는 무시
  }
}

/**
 * 처리 이력 registry를 읽는다. 파일이 없으면 빈 registry를 반환한다.
 */
export function loadRegistry(): ProcessedContentRegistry {
  const filePath = getRegistryPath();

  if (!fs.existsSync(filePath)) {
    return emptyRegistry();
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (raw.trim().length === 0) {
      return emptyRegistry();
    }
    return parseRegistry(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Registry] 읽기 실패 (${filePath}): ${msg} — 빈 registry로 시작합니다.`);
    backupCorruptFile(filePath);
    return emptyRegistry();
  }
}

/**
 * 이미 카드뉴스로 제작 완료된 contentId 집합.
 */
export function loadProcessedIds(): Set<string> {
  const registry = loadRegistry();
  return new Set(Object.keys(registry.entries));
}

export function isProcessed(contentId: string): boolean {
  return loadProcessedIds().has(contentId);
}

export function getProcessedEntry(
  contentId: string,
): ProcessedContentEntry | undefined {
  return loadRegistry().entries[contentId];
}

/**
 * registry 전체를 원자적으로 저장한다.
 */
export function saveRegistry(registry: ProcessedContentRegistry): void {
  const filePath = getRegistryPath();
  ensureDir(path.dirname(filePath));

  const payload: ProcessedContentRegistry = {
    version: REGISTRY_VERSION,
    entries: { ...registry.entries },
  };

  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * 파이프라인 성공 후 contentId를 처리 완료로 기록한다.
 * 동일 contentId가 있으면 덮어쓴다.
 */
export function markProcessed(entry: ProcessedContentEntry): void {
  const registry = loadRegistry();
  registry.entries[entry.contentId] = {
    ...entry,
    processedAt: entry.processedAt || new Date().toISOString(),
  };
  saveRegistry(registry);
  console.log(
    `[Registry] 기록 완료: contentId=${entry.contentId} title="${entry.title}"`,
  );
}

/**
 * 최근 처리 항목 n건 (processedAt 내림차순).
 */
export function listRecent(limit = 10): ProcessedContentEntry[] {
  const registry = loadRegistry();
  return Object.values(registry.entries)
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
    .slice(0, limit);
}

/** registry 파일 경로 (테스트·디버그용) */
export function resolveRegistryPath(): string {
  return getRegistryPath();
}
