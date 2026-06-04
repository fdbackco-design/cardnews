import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { CardNewsSet } from "../../types/cardnews";

/**
 * 각 카드의 imageUrl(Gemini file:// 또는 Pexels https://)을 읽어
 * output/{setId}/backgrounds/bg-00.png, bg-01.png... 로 저장한다.
 * deck의 bgLocalPath 필드에 절대 경로를 설정한 새 deck 객체를 반환한다.
 */
export async function saveBackgroundImages(
  deck: CardNewsSet,
  outputDir: string
): Promise<CardNewsSet> {
  const bgDir = path.join(outputDir, "backgrounds");
  fs.mkdirSync(bgDir, { recursive: true });

  const result: CardNewsSet = {
    ...deck,
    cover: { ...deck.cover },
    cards: deck.cards.map((c) => ({ ...c })),
  };

  const entries: Array<{ imageUrl: string | undefined; index: number }> = [
    { imageUrl: result.cover.imageUrl, index: 0 },
    ...result.cards.map((c, i) => ({ imageUrl: c.imageUrl, index: i + 1 })),
  ];

  for (const { imageUrl, index } of entries) {
    if (!imageUrl) continue;
    const filename = `bg-${String(index).padStart(2, "0")}.png`;
    const destPath = path.join(bgDir, filename);

    let saved = false;

    if (imageUrl.startsWith("file://")) {
      try {
        const localPath = fileURLToPath(imageUrl);
        if (fs.existsSync(localPath)) {
          fs.copyFileSync(localPath, destPath);
          saved = true;
        }
      } catch {
        // ignore
      }
    } else if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
      try {
        const response = await fetch(imageUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          fs.writeFileSync(destPath, buffer);
          saved = true;
        }
      } catch {
        // ignore download failure
      }
    }

    if (saved) {
      if (index === 0) {
        result.cover.bgLocalPath = destPath;
      } else {
        result.cards[index - 1]!.bgLocalPath = destPath;
      }
    }
  }

  return result;
}
