import { Router, Request, Response } from "express";
import { loadDeck } from "../services/cardNewsEditor";
import { buildFigmaExport } from "../services/figmaExporter";

export const figmaRoutes = Router();

// ── FIGMA_EXPORT_TOKEN 검증 ────────────────────────────────────────────────────
// 환경변수 미설정 시 공개 접근 허용, 설정 시 ?token= 검증

function checkFigmaToken(req: Request, res: Response): boolean {
  const envToken = (process.env["FIGMA_EXPORT_TOKEN"] ?? "").trim();
  if (!envToken) return true;  // 토큰 미설정 → 공개

  const queryToken = String(req.query["token"] ?? "").trim();
  if (queryToken && queryToken === envToken) return true;

  res.status(401).json({
    error: "Figma Export Token이 필요합니다. URL에 ?token=TOKEN 을 추가하세요.",
  });
  return false;
}

// ── 클라이언트용 Base URL 생성 (Cloudflare Tunnel 대응) ───────────────────────

function getPublicBaseUrl(req: Request): string {
  const proto = String(
    req.headers["x-forwarded-proto"] ?? req.protocol ?? "http"
  ).split(",")[0]!.trim();
  const host = String(
    req.headers["x-forwarded-host"] ?? req.get("host") ?? "localhost:3000"
  ).trim();
  return `${proto}://${host}`;
}

// ── GET /api/figma/sets/:setId ─────────────────────────────────────────────────
// Figma Plugin이 직접 호출하는 엔드포인트 (일반 세션 인증 없음, 토큰 인증만)

figmaRoutes.get("/sets/:setId", (req: Request, res: Response) => {
  if (!checkFigmaToken(req, res)) return;

  const setId = String(req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }

  const deck = loadDeck(setId);
  if (!deck) {
    res.status(404).json({ error: "deck.json not found for this set" });
    return;
  }

  try {
    const figmaJson = buildFigmaExport(deck);
    res.json(figmaJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/figma/sets/:setId/export-url ─────────────────────────────────────
// 로그인한 웹앱 사용자가 "Figma URL 복사" 버튼 클릭 시 호출
// → token 포함 완성 URL 반환 (토큰이 프론트엔드 JS에 노출되지 않도록)

figmaRoutes.get("/sets/:setId/export-url", (req: Request, res: Response) => {
  const setId = String(req.params["setId"] ?? "");
  if (!setId) { res.status(400).json({ error: "setId required" }); return; }

  const envToken = (process.env["FIGMA_EXPORT_TOKEN"] ?? "").trim();
  const base = getPublicBaseUrl(req);
  const path = `/api/figma/sets/${encodeURIComponent(setId)}`;
  const url = envToken ? `${base}${path}?token=${envToken}` : `${base}${path}`;

  res.json({ url, tokenRequired: Boolean(envToken) });
});
