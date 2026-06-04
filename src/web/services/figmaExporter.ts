import { fileURLToPath } from "url";
import * as fs from "fs";
import * as path from "path";
import type { CardNewsSet, CoverCard, ContentCard } from "../../types/cardnews";

// ── 배경 이미지 URL 해석 ──────────────────────────────────────────────────────

function resolveBgSrc(
  card: CoverCard | ContentCard,
  baseUrl: string | undefined
): string {
  // R2 공개 URL (Instagram 업로드 후 설정됨)
  if (card.bgImageUrl) return card.bgImageUrl;

  // 로컬 저장 배경 이미지 → 웹 서버를 통해 절대 URL로 서빙
  if (card.bgLocalPath && baseUrl) {
    const outputBase = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
    try {
      const rel = path.relative(outputBase, card.bgLocalPath).replace(/\\/g, "/");
      const encoded = rel.split("/").map(encodeURIComponent).join("/");
      return `${baseUrl}/output/${encoded}`;
    } catch {
      // fall through
    }
  }

  // Pexels 등 HTTPS 이미지 — 직접 사용
  if (card.imageUrl && (card.imageUrl.startsWith("https://") || card.imageUrl.startsWith("http://"))) {
    return card.imageUrl;
  }

  // Gemini file:// → 웹 서버 절대 URL로 변환
  if (card.imageUrl && card.imageUrl.startsWith("file://") && baseUrl) {
    try {
      const localPath = fileURLToPath(card.imageUrl);
      const outputBase = path.resolve(process.cwd(), process.env["OUTPUT_DIR"] ?? "output");
      const genDir = path.resolve(process.cwd(), "output", "generated-images");
      let relPath: string;
      if (localPath.startsWith(genDir)) {
        relPath = "generated-images/" + path.relative(genDir, localPath).replace(/\\/g, "/");
      } else if (localPath.startsWith(outputBase)) {
        relPath = path.relative(outputBase, localPath).replace(/\\/g, "/");
      } else {
        return "";
      }
      const encoded = relPath.split("/").map(encodeURIComponent).join("/");
      return `${baseUrl}/output/${encoded}`;
    } catch {
      return "";
    }
  }

  return resolveImageSrc(card.imageUrl);
}

// ── 상수 ──────────────────────────────────────────────────────────────────────

const CARD_W = 1080;
const CARD_H = 1350;
const PAD_X = 80;
const CONTENT_W = 900;  // CARD_W - PAD_X*2 = 920, but CSS uses max-width:900

// 브랜드 로고: R2 CORS 제한 우회를 위해 PNG를 data URL로 직접 임베드
// 파일을 읽을 수 없으면 R2 URL을 fallback으로 사용
function loadBrandLogoSrc(): string {
  try {
    const logoPath = path.resolve(process.cwd(), "public/assets/white.png");
    const bytes = fs.readFileSync(logoPath);
    return "data:image/png;base64," + bytes.toString("base64");
  } catch {
    return "https://pub-9d773a8e8759461eab92383610baddf2.r2.dev/assets/white.png";
  }
}
const BRAND_LOGO_SRC = loadBrandLogoSrc();

// CSS pt → px (96dpi: 1pt = 4/3 px)
function pt(n: number): number {
  return Math.round(n * 4 / 3);
}

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type FigmaImageLayer = {
  type: "image";
  name: string;
  src: string;
  x: number; y: number; width: number; height: number;
  opacity?: number;
};

export type FigmaTextLayer = {
  type: "text";
  name: string;
  text: string;
  x: number; y: number; width: number; height: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  color: string;
  align: "left" | "center" | "right";
};

export type FigmaShapeLayer = {
  type: "shape";
  name: string;
  x: number; y: number; width: number; height: number;
  fill: string;
  opacity: number;
};

// 그라데이션 레이어 — CSS linear-gradient 근사
export type GradientStop = {
  position: number;       // 0-1
  r: number; g: number; b: number; a: number;  // 0-1 each
};

export type GradientFill = {
  direction: "ttb" | "btt" | "ltr";  // top-to-bottom, bottom-to-top, left-to-right
  stops: GradientStop[];
};

export type FigmaGradientLayer = {
  type: "gradient";
  name: string;
  x: number; y: number; width: number; height: number;
  gradients: GradientFill[];
};

export type FigmaLayer = FigmaImageLayer | FigmaTextLayer | FigmaShapeLayer | FigmaGradientLayer;

export type FigmaCard = {
  cardIndex: number;
  name: string;
  width: number;
  height: number;
  layers: FigmaLayer[];
};

export type FigmaExportJson = {
  setId: string;
  title: string;
  width: number;
  height: number;
  cards: FigmaCard[];
};

// ── 이미지 URL 변환 (file:// → /output/...) ───────────────────────────────────

function resolveImageSrc(imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("http")) return imageUrl;
  if (imageUrl.startsWith("file://")) {
    try {
      const localPath = fileURLToPath(imageUrl);
      const cwd = process.cwd();
      const genDir = path.resolve(cwd, "output", "generated-images");
      const outDir = path.resolve(cwd, "output");
      if (localPath.startsWith(genDir)) {
        return "/output/generated-images/" + path.relative(genDir, localPath).replace(/\\/g, "/");
      }
      if (localPath.startsWith(outDir)) {
        return "/output/" + path.relative(outDir, localPath).replace(/\\/g, "/");
      }
    } catch { /* ignore */ }
  }
  return imageUrl;
}

// ── [[...]] 마크업 제거 ───────────────────────────────────────────────────────

function stripMarkup(text: string): string {
  return text.replace(/\[\[([^\]]*)\]\]/g, "$1");
}

// ── 표지 카드 레이어 빌더 ─────────────────────────────────────────────────────

// 표지 오버레이 그라데이션 스탑 (CSS rgba(234,86,53))
const COVER_ORANGE_STOPS: GradientStop[] = [
  { position: 0.00, r: 0.918, g: 0.337, b: 0.208, a: 0.95 },
  { position: 0.14, r: 0.918, g: 0.337, b: 0.208, a: 0.70 },
  { position: 0.28, r: 0.918, g: 0.337, b: 0.208, a: 0.35 },
  { position: 0.50, r: 0.918, g: 0.337, b: 0.208, a: 0.00 },
];

// 내용 카드 3중 비네팅 그라데이션 (CSS 3개 레이어 근사)
const CONTENT_VIGNETTE_GRADIENTS: GradientFill[] = [
  { direction: "ttb", stops: [
    { position: 0.00, r: 0, g: 0, b: 0, a: 0.62 },
    { position: 0.18, r: 0, g: 0, b: 0, a: 0.30 },
    { position: 0.42, r: 0, g: 0, b: 0, a: 0.04 },
    { position: 0.58, r: 0, g: 0, b: 0, a: 0.00 },
  ]},
  { direction: "btt", stops: [
    { position: 0.00, r: 0, g: 0, b: 0, a: 0.82 },
    { position: 0.18, r: 0, g: 0, b: 0, a: 0.60 },
    { position: 0.42, r: 0, g: 0, b: 0, a: 0.22 },
    { position: 0.62, r: 0, g: 0, b: 0, a: 0.00 },
  ]},
  { direction: "ltr", stops: [
    { position: 0.00, r: 0, g: 0, b: 0, a: 0.32 },
    { position: 0.48, r: 0, g: 0, b: 0, a: 0.12 },
    { position: 1.00, r: 0, g: 0, b: 0, a: 0.02 },
  ]},
];

function buildCoverLayers(cover: CoverCard, baseUrl: string | undefined): FigmaLayer[] {
  const layers: FigmaLayer[] = [];

  const isTop = cover.variant !== "bottom";

  // 배경 이미지
  layers.push({
    type: "image", name: "배경 이미지",
    src: resolveBgSrc(cover, baseUrl),
    x: 0, y: 0, width: CARD_W, height: CARD_H,
  });

  // 표지 그라데이션 오버레이 (CSS: 180deg/0deg orange gradient)
  layers.push({
    type: "gradient", name: "표지 그라데이션 오버레이",
    x: 0, y: 0, width: CARD_W, height: CARD_H,
    gradients: [{ direction: isTop ? "ttb" : "btt", stops: COVER_ORANGE_STOPS }],
  });

  // ── CSS 레이아웃 상수 (웹 렌더링 기준) ────────────────────────────────────
  // .card__label            font-size:34pt, line-height:1  → height = pt(34)
  //                         margin-bottom: 14px
  // .card__label-rule       margin-top:4px, height:4px(CSS)/3px(Figma spec), margin-bottom:36px
  // .card__cover-title      line-height:100pt per line
  // .card__cover-subtitle   margin-top:22px
  const LABEL_H     = pt(34);              // label 높이 (line-height:1)
  const LABEL_MB    = 14;                  // label margin-bottom
  const RULE_MT     = 4;                   // rule margin-top
  const RULE_H      = 3;                   // rule 시각 높이 (user spec)
  const RULE_MB     = 36;                  // rule margin-bottom
  const TITLE_LH    = pt(100);             // 제목 한 줄 높이
  const SUBTITLE_MT = 22;                  // 부제 margin-top

  // 구분선 x/width (user spec)
  const RULE_X = 83;
  const RULE_W = 806;

  const titleH = cover.titleLines.length * TITLE_LH;

  let labelY: number, ruleY: number, titleY: number, subtitleY: number;

  if (isTop) {
    // justify-content: flex-start; padding-top: 120px
    // 요소를 위에서 아래로 쌓음
    let y = 120;                              // padding-top
    labelY  = y;
    y      += LABEL_H + LABEL_MB + RULE_MT;  // label 높이 + 두 마진
    ruleY   = y;
    y      += RULE_H + RULE_MB;              // rule 높이 + margin-bottom
    titleY  = y;
    subtitleY = titleY + titleH + SUBTITLE_MT;

  } else {
    // justify-content: flex-end; padding-bottom: 220px
    // 마지막 요소의 bottom = 1350 - 220 = 1130
    // 아래서 위로 역산
    const contentBottom = CARD_H - 220;      // 1130

    let bottomY = contentBottom;

    // 부제가 있으면 가장 아래에 배치 후 위로 올라감
    const subLineH = Math.round(pt(38) * 1.30);
    const subH     = subLineH * 2 + 10;      // 최대 2줄 높이 estimate
    if (cover.subtitle) {
      subtitleY = bottomY - subH;
      bottomY   = subtitleY - SUBTITLE_MT;   // subtitle margin-top 만큼 여백
    } else {
      subtitleY = 0;
    }

    titleY  = bottomY - titleH;
    ruleY   = titleY - RULE_MB - RULE_H;
    labelY  = ruleY  - RULE_MT - LABEL_MB - LABEL_H;
  }

  // 라이프 가이드 레이블
  layers.push({
    type: "text", name: "라이프 가이드 레이블",
    text: cover.label,
    x: PAD_X, y: labelY, width: 500, height: LABEL_H + 10,
    fontFamily: "BMKkubulim", fontSize: pt(34), fontWeight: 400,
    lineHeight: Math.round(pt(34) * 1.2),
    color: "rgba(255,255,255,0.92)", align: "left",
  });

  // 구분선
  layers.push({
    type: "shape", name: "구분선",
    x: RULE_X, y: ruleY, width: RULE_W, height: RULE_H,
    fill: "#FFFFFF", opacity: 0.95,
  });

  // 표지 제목
  layers.push({
    type: "text", name: "제목",
    text: cover.titleLines.join("\n"),
    x: PAD_X, y: titleY, width: CARD_W - PAD_X * 2, height: titleH + 10,
    fontFamily: "Pretendard", fontSize: pt(82), fontWeight: 500,
    lineHeight: TITLE_LH,
    color: "#FFFFFF", align: "left",
  });

  // 부제
  if (cover.subtitle) {
    const subLineH = Math.round(pt(38) * 1.30);
    layers.push({
      type: "text", name: "부제",
      text: cover.subtitle,
      x: PAD_X, y: subtitleY, width: CARD_W - PAD_X * 2, height: subLineH * 2 + 10,
      fontFamily: "Pretendard", fontSize: pt(38), fontWeight: 400,
      lineHeight: subLineH,
      color: "rgba(255,255,255,0.82)", align: "left",
    });
  }

  // 브랜드 로고 이미지 (하단 중앙 고정 — CSS: height:22px, opacity:0.62)
  // Figma 카드는 1080px 기준이지만 로고는 PNG 출력(2x)에 맞춰 44px로 렌더링
  const logoH = 22;
  const logoW = Math.round(787 / 72 * logoH); // 787×72 원본, 비례 너비 ≈ 240
  layers.push({
    type: "image", name: "브랜드 로고",
    src: BRAND_LOGO_SRC,
    x: Math.round((CARD_W - logoW) / 2),
    y: CARD_H - 46 - logoH,
    width: logoW, height: logoH,
    opacity: 0.62,
  });

  return layers;
}

// ── 내용 카드 레이어 빌더 ─────────────────────────────────────────────────────

function buildContentLayers(card: ContentCard, displayIndex: number, baseUrl: string | undefined): FigmaLayer[] {
  const layers: FigmaLayer[] = [];

  // 배경 이미지
  layers.push({
    type: "image", name: "배경 이미지",
    src: resolveBgSrc(card, baseUrl),
    x: 0, y: 0, width: CARD_W, height: CARD_H,
  });

  // 3중 비네팅 그라데이션 오버레이 (CSS: top/bottom/left black gradients)
  layers.push({
    type: "gradient", name: "오버레이",
    x: 0, y: 0, width: CARD_W, height: CARD_H,
    gradients: CONTENT_VIGNETTE_GRADIENTS,
  });

  // 우상단 라이프 가이드 레이블 (absolute)
  const cornerLabelW = 280;
  const cornerLabelH = pt(26) + 10;
  layers.push({
    type: "text", name: "라이프 가이드 코너 레이블",
    text: "라이프 가이드",
    x: CARD_W - PAD_X - cornerLabelW,
    y: 56,
    width: cornerLabelW, height: cornerLabelH,
    fontFamily: "BMKkubulim", fontSize: pt(26), fontWeight: 400,
    lineHeight: Math.round(pt(26) * 1.2),
    color: "rgba(255,255,255,0.88)", align: "right",
  });

  // ── 본문 레이어: 하단에서 상단으로 계산 ───────────────────────────────────
  // card__body: margin-top:auto → 하단에 밀착
  // padding: 86px top, 80px sides, 74px bottom + card__body padding-bottom:60px
  const bodyBottom = CARD_H - 74 - 60; // = 1216
  let y = bodyBottom;

  // 아웃트로 (32pt)
  if (card.outro) {
    const outroLineH = Math.round(pt(32) * 1.34);
    const outroH = outroLineH + 10;
    y -= outroH;
    layers.push({
      type: "text", name: "아웃트로",
      text: card.outro,
      x: PAD_X, y,
      width: CONTENT_W, height: outroH,
      fontFamily: "Pretendard", fontSize: pt(32), fontWeight: 400,
      lineHeight: outroLineH,
      color: "rgba(255,255,255,0.78)", align: "left",
    });
    y -= 14;
  }

  // 하이라이트 (최대 2개, 아래서 위로)
  const highlights = (card.highlights ?? []).slice(0, 2);
  if (highlights.length > 0) {
    const hlLineH = Math.round(pt(34) * 1.32);
    const hlH = hlLineH + 14;

    for (let i = highlights.length - 1; i >= 0; i--) {
      y -= hlH;
      const hlText = stripMarkup(highlights[i] ?? "");

      // 하이라이트 박스
      layers.push({
        type: "shape", name: `하이라이트 박스 ${i + 1}`,
        x: PAD_X, y,
        width: CONTENT_W, height: hlH,
        fill: "#FF6B3D", opacity: 1.0,
      });
      // 하이라이트 텍스트
      layers.push({
        type: "text", name: `하이라이트 텍스트 ${i + 1}`,
        text: hlText,
        x: PAD_X + 9, y: y + 3,
        width: CONTENT_W - 18, height: hlH - 6,
        fontFamily: "Pretendard", fontSize: pt(34), fontWeight: 500,
        lineHeight: hlLineH,
        color: "#111111", align: "left",
      });

      if (i > 0) y -= 8;
    }
    y -= 8; // highlights 블록 위 margin
  }

  // 불릿 (highlights 대신 사용되는 경우)
  const bullets = (card.bullets ?? []);
  if (bullets.length > 0 && highlights.length === 0) {
    const bulletLineH = Math.round(pt(34) * 1.34);
    const bulletH = bulletLineH + 10;

    for (let i = bullets.length - 1; i >= 0; i--) {
      y -= bulletH;
      layers.push({
        type: "text", name: `불릿 ${i + 1}`,
        text: "• " + (bullets[i] ?? ""),
        x: PAD_X, y,
        width: CONTENT_W, height: bulletH,
        fontFamily: "Pretendard", fontSize: pt(34), fontWeight: 400,
        lineHeight: bulletLineH,
        color: "rgba(255,255,255,0.92)", align: "left",
      });
      if (i > 0) y -= 10;
    }
    y -= 14;
  }

  // 인트로 (34pt, 1줄 높이 기준으로 레이아웃 계산 — Figma에서 textAutoResize:HEIGHT로 실제 줄 수 대응)
  if (card.intro) {
    const introLineH = Math.round(pt(34) * 1.34);
    const introH = introLineH + 10;
    y -= introH;
    layers.push({
      type: "text", name: "인트로",
      text: card.intro,
      x: PAD_X, y,
      width: CONTENT_W, height: introH,
      fontFamily: "Pretendard", fontSize: pt(34), fontWeight: 400,
      lineHeight: introLineH,
      color: "rgba(255,255,255,0.92)", align: "left",
    });
    y -= 14;
  }

  // 부제 (34pt)
  if (card.subtitle) {
    const subLineH = Math.round(pt(34) * 1.28);
    const subH = subLineH + 10;
    y -= subH;
    layers.push({
      type: "text", name: "부제",
      text: card.subtitle,
      x: PAD_X, y,
      width: CONTENT_W, height: subH,
      fontFamily: "Pretendard", fontSize: pt(34), fontWeight: 500,
      lineHeight: subLineH,
      color: "#EA5532", align: "left",
    });
    y -= 20;
  }

  // 제목 (76pt) — body의 최상단
  const titleLineH = Math.round(pt(76) * 1.14);
  const estimatedTitleLines = Math.max(1, Math.ceil(card.title.length / 13));
  const titleH = titleLineH * estimatedTitleLines + 10;
  y -= titleH;
  layers.push({
    type: "text", name: "제목",
    text: card.title,
    x: PAD_X, y,
    width: CONTENT_W, height: titleH,
    fontFamily: "Pretendard", fontSize: pt(76), fontWeight: 700,
    lineHeight: titleLineH,
    color: "#FFFFFF", align: "left",
  });

  // 브랜드 로고 이미지 (하단 중앙 고정 — CSS: height:22px, opacity:0.62)
  const logoH = 22;
  const logoW = Math.round(787 / 72 * logoH);
  layers.push({
    type: "image", name: "브랜드 로고",
    src: BRAND_LOGO_SRC,
    x: Math.round((CARD_W - logoW) / 2),
    y: CARD_H - 46 - logoH,
    width: logoW, height: logoH,
    opacity: 0.62,
  });

  return layers;
}

// ── 메인 변환 함수 ────────────────────────────────────────────────────────────

export function buildFigmaExport(deck: CardNewsSet, baseUrl?: string): FigmaExportJson {
  const cards: FigmaCard[] = [];

  cards.push({
    cardIndex: 0,
    name: "00_cover",
    width: CARD_W,
    height: CARD_H,
    layers: buildCoverLayers(deck.cover, baseUrl),
  });

  deck.cards.forEach((card, i) => {
    cards.push({
      cardIndex: i + 1,
      name: `${String(i + 1).padStart(2, "0")}_card`,
      width: CARD_W,
      height: CARD_H,
      layers: buildContentLayers(card, i + 1, baseUrl),
    });
  });

  return {
    setId: deck.id,
    title: deck.title,
    width: CARD_W,
    height: CARD_H,
    cards,
  };
}
