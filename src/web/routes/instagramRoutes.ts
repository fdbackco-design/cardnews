import { Router, Request, Response } from "express";
import { generateDraft } from "../services/instagramDraft";

export const instagramRoutes = Router();

// ── POST /api/instagram/draft ─────────────────────────────────────────────────

instagramRoutes.post("/draft", (req: Request, res: Response) => {
  const { setId } = req.body as { setId?: string };
  if (!setId) {
    res.status(400).json({ error: "setId required" });
    return;
  }
  try {
    const draft = generateDraft(setId);
    res.json(draft);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/instagram/upload (placeholder) ──────────────────────────────────

instagramRoutes.post("/upload", (req: Request, res: Response) => {
  const { setId, caption, imagePaths } = req.body as {
    setId?: string;
    caption?: string;
    imagePaths?: string[];
  };

  if (!setId || !caption || !imagePaths?.length) {
    res.status(400).json({ error: "setId, caption, imagePaths required" });
    return;
  }

  console.log(`[Instagram] 업로드 요청 (placeholder)`);
  console.log(`  setId  : ${setId}`);
  console.log(`  images : ${imagePaths.length}장`);
  console.log(`  caption: ${caption.slice(0, 60)}...`);

  res.json({
    ok: true,
    message: "업로드 준비 완료 (실제 업로드는 아직 구현되지 않았습니다)",
    setId,
    imageCount: imagePaths.length,
  });
});
