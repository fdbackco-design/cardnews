import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import type { CardNewsSet, ContentCard, CoverCard } from "../types/cardnews";
import { writeTextFile } from "../utils/fs";

// ── HTML 이스케이프 ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── 로컬 @font-face 생성 ─────────────────────────────────────────────────────

type LocalFontSpec = {
  family: string;
  weight: number;
  files: { file: string; format: string }[];
};

function buildLocalFontFace(spec: LocalFontSpec): string {
  const fontsDir = path.resolve(process.cwd(), "public/fonts");

  for (const { file, format } of spec.files) {
    const fullPath = path.join(fontsDir, file);
    if (fs.existsSync(fullPath)) {
      const fileUrl = pathToFileURL(fullPath).href;
      console.log(`[Font] ${spec.family} ${spec.weight} 로컬 폰트 사용: ${file}`);
      return `
@font-face {
  font-family: '${spec.family}';
  src: url('${fileUrl}') format('${format}');
  font-weight: ${spec.weight};
  font-style: normal;
  font-display: block;
}`;
    }
  }

  console.warn(`[Font] ${spec.family} ${spec.weight} 로컬 폰트 없음 — fallback`);
  return "";
}

function getLocalFontFaces(): string {
  return [
    buildLocalFontFace({
      family: "BMKkubulim",
      weight: 400,
      files: [
        { file: "BMKkubulim.ttf",    format: "truetype" },
        { file: "BMKkubulimTTF.ttf", format: "truetype" },
        { file: "BMKkubulim.otf",    format: "opentype" },
        { file: "BMKkubulim.woff2",  format: "woff2"    },
        { file: "BMKkubulim.woff",   format: "woff"     },
      ],
    }),
    buildLocalFontFace({
      family: "Pretendard",
      weight: 500,
      files: [
        { file: "Pretendard-Medium.otf",   format: "opentype" },
        { file: "Pretendard-Medium.ttf",   format: "truetype" },
        { file: "Pretendard-Medium.woff2", format: "woff2"    },
      ],
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

// ── 배경 이미지 ───────────────────────────────────────────────────────────────

function bgImg(url?: string): string {
  if (!url) return "";
  return `  <img class="card__bg" src="${esc(url)}" alt="" aria-hidden="true" />\n`;
}

// ── 표지 카드 ─────────────────────────────────────────────────────────────────

function renderCover(cover: CoverCard): string {
  const variantClass =
    cover.variant === "top" ? "card--cover card--top" : "card--cover card--bottom";

  const titleHtml = cover.titleLines
    .map((line) => esc(line))
    .join("<br />");

  const subtitleHtml = cover.subtitle
    ? `  <p class="card__cover-subtitle">${esc(cover.subtitle)}</p>\n`
    : "";

  return `<section class="card ${variantClass}" data-card-index="0">
${bgImg(cover.imageUrl)}  <div class="card__overlay"></div>
  <div class="card__content">
    <p class="card__label">${esc(cover.label)}</p>
    <div class="card__label-rule"></div>
    <h1 class="card__cover-title">${titleHtml}</h1>
${subtitleHtml}  </div>
  <p class="card__logo">TY Life Partners</p>
</section>`;
}

// ── 하이라이트 목록 ───────────────────────────────────────────────────────────

function renderHighlights(items: string[]): string {
  const listItems = items
    .slice(0, 2)
    .map((item) => `    <li class="card__highlight"><span>${esc(item)}</span></li>`)
    .join("\n");
  return `  <ul class="card__highlights">\n${listItems}\n  </ul>\n`;
}

// ── 불릿 목록 ─────────────────────────────────────────────────────────────────

function renderBullets(items: string[]): string {
  const listItems = items
    .map((item) => `    <li class="card__bullet">${esc(item)}</li>`)
    .join("\n");
  return `  <ul class="card__bullets">\n${listItems}\n  </ul>\n`;
}

// ── 내용 카드 ─────────────────────────────────────────────────────────────────

function renderContentCard(card: ContentCard): string {
  const indexHtml = `  <p class="card__index">${card.index < 10 ? "0" : ""}${card.index}</p>\n`;

  const subtitleHtml = card.subtitle
    ? `  <p class="card__subtitle">${esc(card.subtitle)}</p>\n`
    : "";

  const introHtml = card.intro
    ? `  <p class="card__intro">${esc(card.intro)}</p>\n`
    : "";

  const highlightsHtml =
    card.highlights && card.highlights.length > 0
      ? renderHighlights(card.highlights)
      : "";

  const bulletsHtml =
    card.bullets && card.bullets.length > 0
      ? renderBullets(card.bullets)
      : "";

  const outroHtml = card.outro
    ? `  <p class="card__outro">${esc(card.outro)}</p>\n`
    : "";

  return `<section class="card card--content" data-card-index="${card.index}">
${bgImg(card.imageUrl)}  <div class="card__overlay"></div>
  <span class="card__label-corner">라이프 가이드</span>
  <div class="card__content">
    <div class="card__top">
${indexHtml}      <h2 class="card__title">${esc(card.title)}</h2>
${subtitleHtml}    </div>
    <div class="card__body">
${introHtml}${highlightsHtml}${bulletsHtml}${outroHtml}    </div>
  </div>
  <p class="card__logo">TY Life Partners</p>
</section>`;
}

// ── 전체 HTML 문서 ────────────────────────────────────────────────────────────

function buildDocument(deck: CardNewsSet, css: string): string {
  const coverHtml  = renderCover(deck.cover);
  const cardsHtml  = deck.cards.map(renderContentCard).join("\n\n");
  const fontFaces  = getLocalFontFaces();

  const sourceComment = deck.sourceUrl
    ? `\n    <!-- 출처: ${esc(deck.sourceUrl)} -->`
    : "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(deck.title)}</title>${sourceComment}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
  <style>${fontFaces}
    @font-face {
      font-family: 'Pretendard';
      src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style:  normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Pretendard';
      src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/web/static/woff2/Pretendard-Medium.woff2') format('woff2');
      font-weight: 500;
      font-style:  normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Pretendard';
      src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2') format('woff2');
      font-weight: 700;
      font-style:  normal;
      font-display: swap;
    }
    ${css}
  </style>
</head>
<body>

${coverHtml}

${cardsHtml}

</body>
</html>`;
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

export async function renderCardNewsHtml(
  deck: CardNewsSet,
  outputDir: string
): Promise<string> {
  const cssPath = path.resolve(__dirname, "../templates/cardnews.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  const html = buildDocument(deck, css);

  const htmlPath = path.join(outputDir, "html", `${deck.id}.html`);
  writeTextFile(htmlPath, html);

  return htmlPath;
}
