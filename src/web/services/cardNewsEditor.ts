import * as fs from "fs";
import * as path from "path";

import { renderCardNewsHtml } from "../../generator/renderHtml";
import { captureCardsFromHtml } from "../../generator/captureCards";
import { writeTextFile } from "../../utils/fs";
import type { CardNewsSet } from "../../types/cardnews";

// ── 타입 ─────────────────────────────────────────────────────────────────────

export type CardPatch = {
  titleLines?: string[];
  title?: string;
  subtitle?: string;
  intro?: string;
  highlights?: string[];
  outro?: string;
};

export type SetInfo = {
  setId: string;
  outputDir: string;
  htmlPath: string | null;
  imagePaths: string[];
  hasDeck: boolean;
  hasBatchReport: boolean;
};

// ── 경로 유틸 ─────────────────────────────────────────────────────────────────

function resolveOutputDir(): string {
  return path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
}

function setDir(setId: string): string {
  return path.join(resolveOutputDir(), setId);
}

function deckPath(setId: string): string {
  return path.join(setDir(setId), "deck.json");
}

// ── deck.json CRUD ────────────────────────────────────────────────────────────

export function loadDeck(setId: string): (CardNewsSet & Record<string, unknown>) | null {
  const p = deckPath(setId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CardNewsSet & Record<string, unknown>;
  } catch {
    return null;
  }
}

export function saveDeck(setId: string, deck: CardNewsSet & Record<string, unknown>): void {
  writeTextFile(deckPath(setId), JSON.stringify(deck, null, 2));
}

export function updateCard(setId: string, cardIndex: number, patch: CardPatch): CardNewsSet & Record<string, unknown> {
  const deck = loadDeck(setId);
  if (!deck) throw new Error(`deck.json not found for setId: ${setId}`);

  if (cardIndex === 0) {
    // 표지 카드
    if (patch.titleLines) deck.cover.titleLines = patch.titleLines;
    if (patch.subtitle !== undefined) deck.cover.subtitle = patch.subtitle;
  } else {
    const card = deck.cards[cardIndex - 1];
    if (!card) throw new Error(`card index ${cardIndex} not found`);
    if (patch.title !== undefined) card.title = patch.title;
    if (patch.subtitle !== undefined) card.subtitle = patch.subtitle;
    if (patch.intro !== undefined) card.intro = patch.intro;
    if (patch.highlights !== undefined) card.highlights = patch.highlights;
    if (patch.outro !== undefined) card.outro = patch.outro;
  }

  saveDeck(setId, deck);
  return deck;
}

// ── 재렌더링 / 재캡처 ─────────────────────────────────────────────────────────

export async function rerenderDeck(setId: string): Promise<string> {
  const deck = loadDeck(setId);
  if (!deck) throw new Error(`deck.json not found for setId: ${setId}`);

  const dir = setDir(setId);
  const htmlPath = await renderCardNewsHtml(deck as CardNewsSet, dir);
  return htmlPath;
}

export async function recaptureCards(setId: string): Promise<string[]> {
  const dir = setDir(setId);
  const htmlPath = findHtmlFile(dir);
  if (!htmlPath) throw new Error("HTML 파일이 없습니다. 먼저 재렌더링하세요.");

  const deck = loadDeck(setId);
  const totalCards = deck ? deck.cards.length + 1 : 8;

  const result = await captureCardsFromHtml(htmlPath, dir, totalCards);
  return result.imagePaths;
}

// ── 세트 정보 조회 ─────────────────────────────────────────────────────────────

function findHtmlFile(dir: string): string | null {
  const htmlDir = path.join(dir, "html");
  if (!fs.existsSync(htmlDir)) return null;
  const files = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".html"));
  return files.length > 0 ? path.join(htmlDir, files[0]!) : null;
}

export function getSetInfo(setId: string): SetInfo {
  const dir = setDir(setId);
  const htmlPath = findHtmlFile(dir);
  const imagesDir = path.join(dir, "images");
  const deckFile = path.join(dir, "deck.json");
  const reportFile = path.join(dir, "batch-report.json");

  let imagePaths: string[] = [];
  if (fs.existsSync(imagesDir)) {
    imagePaths = fs
      .readdirSync(imagesDir)
      .filter((f) => f.endsWith(".png"))
      .sort()
      .map((f) => path.join(imagesDir, f));
  }

  return {
    setId,
    outputDir: dir,
    htmlPath,
    imagePaths,
    hasDeck: fs.existsSync(deckFile),
    hasBatchReport: fs.existsSync(reportFile),
  };
}

// ── 생성 이력 목록 ─────────────────────────────────────────────────────────────

export type HistoryEntry = {
  setId: string;
  title: string;
  source: string;
  cardCount: number;
  createdAt?: string;
  htmlPath: string | null;
  imagePaths: string[];
  hasDeck: boolean;
};

export function listHistory(): HistoryEntry[] {
  const outputDir = resolveOutputDir();
  if (!fs.existsSync(outputDir)) return [];

  const entries: HistoryEntry[] = [];

  for (const name of fs.readdirSync(outputDir)) {
    const dir = path.join(outputDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;

    const htmlPath = findHtmlFile(dir);
    const deckFile = path.join(dir, "deck.json");
    const imagesDir = path.join(dir, "images");

    if (!htmlPath) continue;

    let imagePaths: string[] = [];
    if (fs.existsSync(imagesDir)) {
      imagePaths = fs
        .readdirSync(imagesDir)
        .filter((f) => f.endsWith(".png"))
        .sort()
        .map((f) => path.join(imagesDir, f));
    }

    let title = name;
    let source = "cli";
    let cardCount = imagePaths.length;
    let createdAt: string | undefined;

    if (fs.existsSync(deckFile)) {
      try {
        const deck = JSON.parse(fs.readFileSync(deckFile, "utf-8")) as Record<string, unknown>;
        title = (deck["title"] as string) ?? name;
        const meta = deck["_webMeta"] as Record<string, unknown> | undefined;
        source = (meta?.["source"] as string) ?? "cli";
        createdAt = meta?.["createdAt"] as string | undefined;
        const cards = deck["cards"];
        if (Array.isArray(cards)) cardCount = cards.length + 1;
      } catch {
        // fallback to folder name
      }
    }

    entries.push({
      setId: name,
      title,
      source,
      cardCount,
      createdAt,
      htmlPath,
      imagePaths,
      hasDeck: fs.existsSync(deckFile),
    });
  }

  return entries.sort((a, b) => {
    const da = a.createdAt ?? a.setId;
    const db = b.createdAt ?? b.setId;
    return db.localeCompare(da);
  });
}
