// TY 카드뉴스 Figma Importer — Plugin Main (Sandbox)
figma.showUI(__html__, { width: 460, height: 480, title: "TY 카드뉴스 Importer" });

// ── 폰트 로드 ─────────────────────────────────────────────────────────────────

// 폰트 무게 → Figma 스타일 이름
function weightToStyle(weight) {
  if (weight <= 300) return "Light";
  if (weight <= 400) return "Regular";
  if (weight <= 500) return "Medium";
  if (weight <= 600) return "SemiBold";
  if (weight <= 700) return "Bold";
  return "Bold";
}

// "라이프 가이드" 시리즈 레이블 레이어 판별
function isSeriesLabelLayer(layer) {
  if (layer.id === "series_label") return true;
  if (layer.name && (layer.name.indexOf("라이프") !== -1 || layer.name.indexOf("가이드") !== -1)) return true;
  if (layer.text && (layer.text.indexOf("라이프 가이드") !== -1 || layer.text.indexOf("LIFE GUIDE") !== -1)) return true;
  return false;
}

// 후보 폰트 목록을 순서대로 시도, 첫 번째 후보가 primaryFamily
// returns { family, style, isFallback }
async function loadFontCandidates(candidates, weight, primaryFamily) {
  var style = weightToStyle(weight);

  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    console.log("[font] trying", candidate, style);
    try {
      await figma.loadFontAsync({ family: candidate, style: style });
      console.log("[font] loaded", candidate, style);
      return { family: candidate, style: style, isFallback: candidate !== primaryFamily };
    } catch (err) {
      console.warn("[font] failed", candidate, style, String(err));
    }

    // weight 스타일 실패 시 Regular 재시도
    if (style !== "Regular") {
      console.log("[font] trying", candidate, "Regular");
      try {
        await figma.loadFontAsync({ family: candidate, style: "Regular" });
        console.log("[font] loaded", candidate, "Regular");
        return { family: candidate, style: "Regular", isFallback: candidate !== primaryFamily };
      } catch (err2) {
        console.warn("[font] failed", candidate, "Regular", String(err2));
      }
    }
  }

  // 절대 최후 폴백
  console.warn("[font] all candidates failed, falling back to Inter Regular");
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  return { family: "Inter", style: "Regular", isFallback: true };
}

// "라이프 가이드" 전용: BM kkubulim 1순위
var SERIES_LABEL_CANDIDATES = [
  "BM kkubulim",
  "BM Kkubulim",
  "BMKkubulim",
  "배달의민족 꾸불림",
  "Noto Sans KR",
  "Inter",
];

async function loadSeriesLabelFont(weight) {
  return loadFontCandidates(SERIES_LABEL_CANDIDATES, weight, "BM kkubulim");
}

// 일반 텍스트용: Pretendard → Noto Sans KR → Inter
var FONT_FALLBACKS = {
  "Pretendard": ["Noto Sans KR", "Inter"],
};

async function loadFont(family, weight) {
  var fallbacks = FONT_FALLBACKS[family] || ["Noto Sans KR", "Inter"];
  var candidates = [family].concat(fallbacks);
  return loadFontCandidates(candidates, weight, family);
}

// ── 색상 파싱 ─────────────────────────────────────────────────────────────────

function parseColor(colorStr) {
  if (!colorStr) return { r: 1, g: 1, b: 1, a: 1 };

  // rgba(r, g, b, a)
  const rgbaM = String(colorStr).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgbaM) {
    return {
      r: parseInt(rgbaM[1]) / 255,
      g: parseInt(rgbaM[2]) / 255,
      b: parseInt(rgbaM[3]) / 255,
      a: rgbaM[4] !== undefined ? parseFloat(rgbaM[4]) : 1,
    };
  }

  // #RRGGBB or #RGB
  const hexM = String(colorStr).match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexM) {
    const h = hexM[1];
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16) / 255,
        g: parseInt(h[1] + h[1], 16) / 255,
        b: parseInt(h[2] + h[2], 16) / 255,
        a: 1,
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16) / 255,
      g: parseInt(h.slice(2, 4), 16) / 255,
      b: parseInt(h.slice(4, 6), 16) / 255,
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  return { r: 1, g: 1, b: 1, a: 1 };
}

// ── 레이어 생성 ───────────────────────────────────────────────────────────────

async function createImageLayer(layer, imageBytes) {
  const node = figma.createRectangle();
  node.name = layer.name;
  node.x = layer.x;
  node.y = layer.y;
  node.resize(layer.width, layer.height);
  node.cornerRadius = 0;

  if (imageBytes && imageBytes.length > 0) {
    try {
      var img = figma.createImage(new Uint8Array(imageBytes));
      node.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: img.hash }];
    } catch (err) {
      console.error("[image fetch failed]", layer.name, layer.src || "(no src)", String(err));
      node.name = "이미지 로드 실패: " + layer.name + (layer.src ? " - " + layer.src : "");
      node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
    }
  } else {
    console.error("[image fetch failed]", layer.name, layer.src || "(no src)", "bytes not received");
    node.name = "이미지 로드 실패: " + layer.name + (layer.src ? " - " + layer.src : "");
    node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
  }

  if (layer.opacity !== null && layer.opacity !== undefined) {
    node.opacity = layer.opacity;
  }

  return node;
}

// Figma GRADIENT_LINEAR gradientTransform by direction
// Maps gradient u-axis (0=start, 1=end) to node normalized space (0-1)
var GRADIENT_TRANSFORMS = {
  ttb: [[0, 1, 0], [1, 0, 0]],        // top-to-bottom
  btt: [[0, 1, 0], [-1, 0, 1]],       // bottom-to-top
  ltr: [[1, 0, 0], [0, 1, 0]],        // left-to-right
};

async function createGradientLayer(layer) {
  const node = figma.createRectangle();
  node.name = layer.name;
  node.x = layer.x;
  node.y = layer.y;
  node.resize(layer.width, layer.height);

  node.fills = layer.gradients.map(function(g) {
    var transform = GRADIENT_TRANSFORMS[g.direction] || GRADIENT_TRANSFORMS.ttb;
    return {
      type: "GRADIENT_LINEAR",
      gradientTransform: transform,
      gradientStops: g.stops.map(function(s) {
        return {
          position: s.position,
          color: { r: s.r, g: s.g, b: s.b, a: s.a },
        };
      }),
    };
  });

  return node;
}

async function createShapeLayer(layer) {
  const node = figma.createRectangle();
  node.name = layer.name;
  node.x = layer.x;
  node.y = layer.y;
  node.resize(layer.width, layer.height);

  var c = parseColor(layer.fill);
  var layerOpacity = (layer.opacity !== null && layer.opacity !== undefined) ? layer.opacity : 1;
  node.fills = [{
    type: "SOLID",
    color: { r: c.r, g: c.g, b: c.b },
    opacity: c.a * layerOpacity,
  }];

  return node;
}

async function createTextLayer(layer) {
  const node = figma.createText();
  node.x = layer.x;
  node.y = layer.y;

  var fontResult;
  if (isSeriesLabelLayer(layer)) {
    console.log("[font] series-label layer detected:", layer.name);
    fontResult = await loadSeriesLabelFont(layer.fontWeight);
  } else {
    fontResult = await loadFont(layer.fontFamily, layer.fontWeight);
  }

  node.fontName = { family: fontResult.family, style: fontResult.style };
  node.name = fontResult.isFallback ? layer.name + " [폰트 대체됨]" : layer.name;

  node.fontSize = layer.fontSize;
  node.lineHeight = { unit: "PIXELS", value: layer.lineHeight };
  node.textAutoResize = "HEIGHT";

  const text = layer.text || "";
  node.characters = text;
  node.resize(layer.width, node.height);

  const alignMap = { left: "LEFT", center: "CENTER", right: "RIGHT" };
  node.textAlignHorizontal = alignMap[layer.align] || "LEFT";

  const c = parseColor(layer.color);
  node.fills = [{
    type: "SOLID",
    color: { r: c.r, g: c.g, b: c.b },
    opacity: c.a,
  }];

  return node;
}

// ── 카드 Frame 생성 ───────────────────────────────────────────────────────────

async function createCardFrame(cardData, imagesMap, offsetX) {
  const frame = figma.createFrame();
  frame.name = cardData.name;
  frame.resize(cardData.width, cardData.height);
  frame.x = offsetX;
  frame.y = 0;
  frame.clipsContent = true;
  frame.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }];

  for (const layer of cardData.layers) {
    let node;
    if (layer.type === "image") {
      const key = `${cardData.cardIndex}-${layer.name}`;
      const bytes = imagesMap[key] || null;
      node = await createImageLayer(layer, bytes);
    } else if (layer.type === "gradient") {
      node = await createGradientLayer(layer);
    } else if (layer.type === "shape") {
      node = await createShapeLayer(layer);
    } else if (layer.type === "text") {
      node = await createTextLayer(layer);
    }
    if (node) frame.appendChild(node);
  }

  return frame;
}

// ── 메인 처리 ─────────────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  if (msg.type === "create-cards") {
    const { exportData, imagesMap } = msg;
    const frames = [];
    let offsetX = 0;
    const GAP = 40;

    figma.ui.postMessage({ type: "progress", text: "카드 Frame 생성 중..." });

    try {
      for (let i = 0; i < exportData.cards.length; i++) {
        const cardData = exportData.cards[i];
        figma.ui.postMessage({
          type: "progress",
          text: `카드 ${i + 1}/${exportData.cards.length} 생성 중...`,
        });
        const frame = await createCardFrame(cardData, imagesMap, offsetX);
        frames.push(frame);
        offsetX += cardData.width + GAP;
      }

      // 생성된 Frame들을 화면 중앙으로
      if (frames.length > 0) {
        figma.currentPage.selection = frames;
        figma.viewport.scrollAndZoomIntoView(frames);
      }

      figma.ui.postMessage({
        type: "done",
        text: `✅ ${frames.length}장 카드 생성 완료!`,
      });
    } catch (err) {
      figma.ui.postMessage({
        type: "error",
        text: `생성 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  if (msg.type === "cancel") {
    figma.closePlugin();
  }
};
