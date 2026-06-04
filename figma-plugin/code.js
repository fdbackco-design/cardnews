// TY 카드뉴스 Figma Importer — Plugin Main (Sandbox)
figma.showUI(__html__, { width: 460, height: 480, title: "TY 카드뉴스 Importer" });

// ── 폰트 로드 ─────────────────────────────────────────────────────────────────

// Figma에서 사용 가능한 폰트 패밀리로 매핑
const FONT_MAP = {
  "Pretendard": ["Noto Sans KR", "Inter"],
  "BMKkubulim": ["Noto Sans KR", "Inter"],
};

// 폰트 무게 → Figma 스타일 이름
function weightToStyle(weight) {
  if (weight <= 300) return "Light";
  if (weight <= 400) return "Regular";
  if (weight <= 500) return "Medium";
  if (weight <= 600) return "SemiBold";
  if (weight <= 700) return "Bold";
  return "Bold";
}

async function loadFont(family, weight) {
  const style = weightToStyle(weight);
  const candidates = [family, ...(FONT_MAP[family] || [])];
  for (const candidate of candidates) {
    try {
      await figma.loadFontAsync({ family: candidate, style });
      return { family: candidate, style };
    } catch {
      // 해당 weight가 없으면 Regular 시도
      try {
        await figma.loadFontAsync({ family: candidate, style: "Regular" });
        return { family: candidate, style: "Regular" };
      } catch {
        continue;
      }
    }
  }
  // 최후 폴백
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  return { family: "Inter", style: "Regular" };
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
      const img = figma.createImage(new Uint8Array(imageBytes));
      node.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: img.hash }];
    } catch {
      node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
    }
  } else {
    // placeholder: 회색
    node.fills = [{ type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } }];
  }

  return node;
}

async function createShapeLayer(layer) {
  const node = figma.createRectangle();
  node.name = layer.name;
  node.x = layer.x;
  node.y = layer.y;
  node.resize(layer.width, layer.height);

  const c = parseColor(layer.fill);
  node.fills = [{
    type: "SOLID",
    color: { r: c.r, g: c.g, b: c.b },
    opacity: c.a * (layer.opacity ?? 1),
  }];

  return node;
}

async function createTextLayer(layer) {
  const node = figma.createText();
  node.name = layer.name;
  node.x = layer.x;
  node.y = layer.y;

  const fontName = await loadFont(layer.fontFamily, layer.fontWeight);
  node.fontName = fontName;
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
