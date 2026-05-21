import { Router, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";

import {
  createJob,
  getJob,
  startJob,
  listJobs,
  type GenerateInput,
} from "../services/jobManager";
import {
  loadDeck,
  updateCard,
  rerenderDeck,
  recaptureCards,
  getSetInfo,
  listHistory,
  type CardPatch,
} from "../services/cardNewsEditor";

export const cardNewsRoutes = Router();

// ── POST /api/cardnews/generate ───────────────────────────────────────────────

cardNewsRoutes.post("/generate", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  const mode = body["mode"] as string;
  if (mode !== "kdca" && mode !== "custom-topic") {
    res.status(400).json({ error: 'mode must be "kdca" or "custom-topic"' });
    return;
  }

  const input: GenerateInput = {
    mode,
    keyword: body["keyword"] as string | undefined,
    contentId: body["contentId"] as string | undefined,
    autoSelect: Boolean(body["autoSelect"]),
    topic: body["topic"] as string | undefined,
    targetAudience: body["targetAudience"] as string | undefined,
    cardCount: body["cardCount"] ? Number(body["cardCount"]) : undefined,
    tone: body["tone"] as string | undefined,
    referenceText: body["referenceText"] as string | undefined,
    capture: body["capture"] !== false,
  };

  const job = createJob(input);
  startJob(job.id);

  res.json({ jobId: job.id });
});

// ── GET /api/cardnews/jobs ────────────────────────────────────────────────────

cardNewsRoutes.get("/jobs", (_req: Request, res: Response) => {
  res.json(listJobs());
});

// ── GET /api/cardnews/jobs/:jobId ─────────────────────────────────────────────

cardNewsRoutes.get("/jobs/:jobId", (req: Request, res: Response) => {
  const job = getJob(String(req.params["jobId"] ?? ""));
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
});

// ── GET /api/cardnews/history ─────────────────────────────────────────────────

cardNewsRoutes.get("/history", (_req: Request, res: Response) => {
  try {
    const history = listHistory();
    const outputBase = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
    const toRelUrl = (absPath: string) =>
      "/output/" + path.relative(outputBase, absPath).replace(/\\/g, "/");

    const enriched = history.map((entry) => ({
      ...entry,
      htmlUrl: entry.htmlPath ? toRelUrl(entry.htmlPath) : null,
      imageUrls: entry.imagePaths.map(toRelUrl),
    }));

    res.json(enriched);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/cardnews/sets/:setId ─────────────────────────────────────────────

cardNewsRoutes.get("/sets/:setId", (req: Request, res: Response) => {
  const setId = String(req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }
  try {
    const info = getSetInfo(setId);
    const deck = loadDeck(setId);

    const outputBase = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
    const toRelUrl = (absPath: string) =>
      "/output/" + path.relative(outputBase, absPath).replace(/\\/g, "/");

    // batch-report.json
    let batchReport: Record<string, unknown> | null = null;
    const reportPath = path.join(info.outputDir, "batch-report.json");
    if (fs.existsSync(reportPath)) {
      try { batchReport = JSON.parse(fs.readFileSync(reportPath, "utf-8")); } catch { /* ignore */ }
    }

    // _webMeta from deck
    const webMeta = (deck as Record<string, unknown> | null)?.["_webMeta"] ?? null;

    // prompts.json check
    const promptsPath = path.join(info.outputDir, "debug", "prompts.json");
    const hasPrompts = fs.existsSync(promptsPath);

    res.json({
      ...info,
      htmlUrl: info.htmlPath ? toRelUrl(info.htmlPath) : null,
      imageUrls: info.imagePaths.map(toRelUrl),
      imageFileNames: info.imagePaths.map((p) => path.basename(p)),
      deck,
      batchReport,
      webMeta,
      hasPrompts,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/cardnews/sets/:setId/deck ────────────────────────────────────────

cardNewsRoutes.get("/sets/:setId/deck", (req: Request, res: Response) => {
  const setId = String(req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }
  const deck = loadDeck(setId);
  if (!deck) {
    res.status(404).json({ error: "deck.json not found for this set" });
    return;
  }
  res.json(deck);
});

// ── PATCH /api/cardnews/sets/:setId/cards/:cardIndex ─────────────────────────

cardNewsRoutes.patch("/sets/:setId/cards/:cardIndex", (req: Request, res: Response) => {
  const setId = String(req.params["setId"] ?? "");
  const cardIndex = String(req.params["cardIndex"] ?? "");
  if (!setId || !cardIndex) {
    res.status(400).json({ error: "setId and cardIndex required" });
    return;
  }
  const index = parseInt(cardIndex, 10);
  if (isNaN(index)) {
    res.status(400).json({ error: "cardIndex must be a number" });
    return;
  }
  try {
    const patch = req.body as CardPatch;
    const deck = updateCard(setId, index, patch);
    res.json({ ok: true, deck });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── 공통 URL 변환 유틸 ────────────────────────────────────────────────────────

function makeToRelUrl() {
  const outputBase = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
  return (absPath: string) =>
    "/output/" + path.relative(outputBase, absPath).replace(/\\/g, "/");
}

// ── POST /api/cardnews/sets/:setId/rerender (HTML만) ─────────────────────────

cardNewsRoutes.post("/sets/:setId/rerender", async (req: Request, res: Response) => {
  const setId = String(req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }
  try {
    const htmlPath = await rerenderDeck(setId);
    const toRelUrl = makeToRelUrl();
    res.json({ ok: true, htmlUrl: toRelUrl(htmlPath) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/cardnews/sets/:setId/recapture (PNG만) ─────────────────────────

cardNewsRoutes.post("/sets/:setId/recapture", async (_req: Request, res: Response) => {
  const setId = String(_req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }
  try {
    const imagePaths = await recaptureCards(setId);
    const toRelUrl = makeToRelUrl();
    res.json({ ok: true, imageUrls: imagePaths.map(toRelUrl) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/cardnews/sets/:setId/rebuild (HTML + PNG) ──────────────────────

cardNewsRoutes.post("/sets/:setId/rebuild", async (_req: Request, res: Response) => {
  const setId = String(_req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }
  try {
    const htmlPath = await rerenderDeck(setId);
    const imagePaths = await recaptureCards(setId);
    const toRelUrl = makeToRelUrl();
    res.json({
      ok: true,
      htmlUrl: toRelUrl(htmlPath),
      imageUrls: imagePaths.map(toRelUrl),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
