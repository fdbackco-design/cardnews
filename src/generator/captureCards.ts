import * as fs from "fs";
import * as path from "path";

import { brand } from "../config/brand";
import type { CardNewsOutput } from "../types/cardnews";
import { ensureDir } from "../utils/fs";

// ── Playwright 캡처 ───────────────────────────────────────────────────────────

export async function captureCardsFromHtml(
  htmlPath: string,
  outputDir: string,
  cardCount: number
): Promise<CardNewsOutput> {
  const imagesDir = path.join(outputDir, "images");
  const debugDir  = path.join(outputDir, "debug");
  ensureDir(imagesDir);

  console.log(`[Capture] 대상: ${path.basename(htmlPath)}`);
  console.log(`[Capture] 크기: ${brand.cardWidth}×${brand.cardHeight}px (x${brand.outputScale})`);

  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    console.error(
      "[Capture] Playwright 모듈 없음. 다음을 실행하세요:\n" +
      "    npm install playwright\n" +
      "    npx playwright install chromium"
    );
    return { htmlPath, imagePaths: [], debugDir };
  }

  const browser = await playwright.chromium.launch().catch((err: Error) => {
    if (err.message.includes("Executable doesn't exist")) {
      console.error(
        "[Capture] Chromium 바이너리 없음. 다음을 실행하세요:\n" +
        "    npx playwright install chromium"
      );
      return null;
    }
    throw err;
  });

  if (!browser) return { htmlPath, imagePaths: [], debugDir };

  const page = await browser.newPage({
    viewport:          { width: brand.cardWidth, height: brand.cardHeight },
    deviceScaleFactor: brand.outputScale,
  });

  const fileUrl = `file://${path.resolve(htmlPath)}`;
  await page.goto(fileUrl, { waitUntil: "load" });

  // 웹폰트 렌더링 대기
  await page.waitForTimeout(2500);

  const cards  = page.locator(".card");
  const actual = await cards.count();
  console.log(`[Capture] 감지된 카드: ${actual}장`);

  const imagePaths: string[] = [];

  for (let i = 0; i < actual; i++) {
    const num     = String(i + 1).padStart(2, "0");
    const imgPath = path.join(imagesDir, `card-${num}.png`);

    try {
      await cards.nth(i).screenshot({ path: imgPath });
      imagePaths.push(imgPath);
      console.log(`  [${num}/${actual}] 저장: card-${num}.png`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [${num}/${actual}] 캡처 실패 — ${msg.slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log(`[Capture] 완료 — ${imagePaths.length}장 저장`);

  return { htmlPath, imagePaths, debugDir };
}

// ── 독립 실행 (npm run capture) ───────────────────────────────────────────────

function findLatestHtml(): string | undefined {
  const outputRoot = path.resolve("./output");
  if (!fs.existsSync(outputRoot)) return undefined;

  const candidates: { file: string; mtime: number }[] = [];

  for (const entry of fs.readdirSync(outputRoot)) {
    const htmlDir = path.join(outputRoot, entry, "html");
    if (!fs.existsSync(htmlDir)) continue;
    for (const file of fs.readdirSync(htmlDir)) {
      if (!file.endsWith(".html")) continue;
      const full = path.join(htmlDir, file);
      candidates.push({ file: full, mtime: fs.statSync(full).mtimeMs });
    }
  }

  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].file;
}

async function main(): Promise<void> {
  const htmlPath = findLatestHtml();

  if (!htmlPath) {
    console.error(
      "[Capture] output 폴더에 HTML 파일이 없습니다.\n" +
      "  먼저 아래 명령어를 실행하세요:\n" +
      "    npm run generate"
    );
    process.exit(1);
  }

  // htmlPath: .../output/{slug}/html/{id}.html → outputDir: .../output/{slug}/
  const outputDir = path.dirname(path.dirname(htmlPath));
  console.log(`[Capture] HTML: ${htmlPath}`);

  await captureCardsFromHtml(htmlPath, outputDir, 0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[Capture 오류]", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
