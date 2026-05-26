import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import * as path from "path";

import { cardNewsRoutes } from "./routes/cardNewsRoutes";
import { instagramRoutes } from "./routes/instagramRoutes";

const app = express();
const PORT = parseInt(process.env["WEB_PORT"] ?? "3000", 10);

// ── 미들웨어 ──────────────────────────────────────────────────────────────────

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ── 정적 파일 ─────────────────────────────────────────────────────────────────

// 웹앱 static (public 폴더)
app.use(express.static(path.join(__dirname, "public")));

// output 폴더 서빙 (생성된 HTML/PNG)
const OUTPUT_DIR = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
app.use("/output", express.static(OUTPUT_DIR));

// ── API 라우트 ────────────────────────────────────────────────────────────────

app.use("/api/cardnews", cardNewsRoutes);
app.use("/api/instagram", instagramRoutes);

// ── SPA fallback ──────────────────────────────────────────────────────────────

app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  TY Life Partners | 카드뉴스 관리 웹앱");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  URL : http://localhost:${PORT}`);
  console.log(`  출력: ${OUTPUT_DIR}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
});
