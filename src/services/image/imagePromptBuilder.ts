// ── 출력 규격 (카드뉴스와 동일) ───────────────────────────────────────────────

export const CARD_IMAGE_WIDTH  = 1080;
export const CARD_IMAGE_HEIGHT = 1350;

const OUTPUT_DIMENSIONS_RULE =
  `Generate a pure full-bleed vertical editorial photograph. ` +
  `Aspect ratio: 4:5 portrait. Target final size: ${CARD_IMAGE_WIDTH}×${CARD_IMAGE_HEIGHT}px. ` +
  "The photo MUST fill the entire frame from edge to edge — no border, no padding, no margin, no blank area of any kind. " +
  "If exact 4:5 is not achievable, generate a 3:4 portrait photo suitable for center-cropping to 1080×1350. " +
  "NEVER create a landscape, square, wide horizontal, letterbox, pillarbox, poster layout, collage, or composite image.";

const NO_TEXT_RULE =
  "[NO TEXT — ABSOLUTE] This image must contain ZERO text of any kind. " +
  "No Korean text. No English text. No letters. No numbers. No captions. No subtitles. No signs. No labels. " +
  "No packaging labels. No UI text. No screen text. No watermark. No logo. No handwritten text. " +
  "No chart text. No infographic elements. No text box. No caption area. No white text panel. No gray text panel. " +
  "Card text will be added by the application in post-production — do NOT include any text in this image. " +
  "Any character, Hangul, or symbol in the generated image is an automatic failure.";

const KOREAN_PERSON_RULE =
  "IF A PERSON APPEARS: Must be clearly Korean (South Korean — Korean facial features, hair, styling). " +
  "Not Japanese, not Chinese, not other East Asian or Western. Natural editorial lifestyle, not posed.";

// ── 타입 ──────────────────────────────────────────────────────────────────────

export type SceneCategory =
  | "cover"
  | "concept"
  | "measurement"
  | "habit"
  | "risk"
  | "method"
  | "lifestyle"
  | "object-closeup"
  | "environment"
  | "summary";

export type SubjectType = "person" | "object" | "environment" | "symbolic" | "mixed";

export type ShotType =
  | "close-up"
  | "medium shot"
  | "wide shot"
  | "over-the-shoulder"
  | "top-down"
  | "side profile"
  | "detail shot";

export type SceneSetting =
  | "Korean home living room"
  | "Korean kitchen"
  | "quiet bedroom"
  | "home desk"
  | "clinic consultation room"
  | "outdoor park"
  | "morning window light"
  | "evening indoor light"
  | "minimal tabletop scene";

export type CardScene = {
  category:    SceneCategory;
  subjectType: SubjectType;
  shotType:    ShotType;
  setting:     SceneSetting;
  action:      string;
  mood:        string;
  composition: string;
  avoid:       string[];
};

// ── 키워드 그룹 ───────────────────────────────────────────────────────────────

const KW = {
  concept:     ["숫자", "수치", "기준", "범위", "의미", "mmhg", "정상", "기준치", "단계", "뜻", "수축기", "이완기"],
  routine:     ["기록", "일지", "다이어리", "아침", "저녁", "매일", "추적", "꾸준히"],
  measurement: ["측정", "재는", "방법", "기기", "커프", "혈압계", "체크"],
  exercise:    ["운동", "걷기", "달리기", "산책", "유산소", "체육", "활동량", "움직임"],
  diet:        ["식사", "음식", "나트륨", "채소", "과일", "영양", "식습관", "저염", "카페인", "알코올", "음주"],
  sleep:       ["수면", "잠", "휴식", "피로", "수면 관리"],
  stress:      ["스트레스", "이완", "명상", "호흡", "안정", "긴장", "해소"],
  caution:     ["경계", "위험", "주의", "증상", "합병증", "고혈압", "저혈압", "경고", "악화", "부담", "원인"],
  medical:     ["병원", "검진", "의사", "진료", "처방"],
  general:     ["생활습관", "관리", "일상", "꾸준", "규칙적", "실천", "정리"],
};

function has(text: string, keywords: string[]): boolean {
  const t = text.toLowerCase();
  return keywords.some((k) => t.includes(k.toLowerCase()));
}

// ── 한국어 건강 키워드 → 구체적 영문 피사체 매핑 ──────────────────────────────
// 구체적인 것부터 먼저 배치 (앞에서 매칭될수록 우선순위 높음)

// 우선순위: 구체적 생활/행동 키워드를 먼저, 주제 일반어(혈압/간 등)는 마지막
// → 같은 주제 내에서도 카드별 본문 내용에 따라 다른 시각 소재가 추출됨
const VISUAL_SUBJECTS: Array<{ kw: string[]; visual: string }> = [
  // ── 1순위: 측정 기기 화합물 (매우 구체적) ─────────────────────────────────
  { kw: ["혈압 측정", "혈압을 측정"],           visual: "a blood pressure cuff wrapped around a forearm, the monitor screen turned off and blank" },
  { kw: ["수축기", "이완기", "mmhg"],            visual: "a compact home blood pressure monitor on a wooden surface, display screen completely blank" },
  { kw: ["혈압계", "커프"],                      visual: "a blood pressure cuff and monitor placed on a table, screen off" },
  { kw: ["혈당", "당뇨"],                        visual: "a glucometer device on a clean white surface, display screen blank" },
  // ── 2순위: 식이/음식 ──────────────────────────────────────────────────────
  { kw: ["나트륨", "저염"],                      visual: "a bowl of fresh low-sodium Korean food with colorful vegetables, no labels visible" },
  { kw: ["알코올", "음주", "술"],                visual: "a glass of clear water in focus, a blurred empty wine glass pushed to the background" },
  { kw: ["카페인", "커피"],                      visual: "a ceramic coffee cup on a wooden desk in warm morning light" },
  { kw: ["채소", "야채"],                        visual: "colorful fresh vegetables spread on a clean Korean kitchen countertop" },
  { kw: ["과일"],                                visual: "a small bowl of seasonal fruits on a kitchen table" },
  { kw: ["식사", "식단", "음식"],                visual: "a balanced Korean meal arranged on a wooden dining table" },
  { kw: ["콜레스테롤"],                          visual: "a bowl of oatmeal topped with fresh berries and nuts on a breakfast table" },
  // ── 3순위: 운동 ───────────────────────────────────────────────────────────
  { kw: ["걷기", "산책"],                        visual: "a paved park walking path lined with trees, dappled morning light, no person required" },
  { kw: ["달리기", "조깅"],                      visual: "a pair of running shoes placed near a park path entrance" },
  { kw: ["유산소", "운동"],                      visual: "a pair of clean athletic shoes on a warm wooden floor in natural light" },
  { kw: ["체중", "비만"],                        visual: "a clean bathroom scale on a tiled floor beside neatly folded towels" },
  // ── 4순위: 기록 / 루틴 ────────────────────────────────────────────────────
  { kw: ["기록", "일지", "다이어리"],            visual: "an open spiral health notebook with a pen resting on a wooden desk, no readable handwriting" },
  { kw: ["아침 기상", "저녁 잠"],                visual: "a morning desk setup: a glass of water, an open notebook, warm ambient light" },
  { kw: ["금연"],                                visual: "a fresh outdoor park scene with green trees, open air, and a walking path" },
  // ── 5순위: 수면 ───────────────────────────────────────────────────────────
  { kw: ["수면", "잠"],                          visual: "a neatly made bed with soft morning light filtering through white curtains" },
  { kw: ["피로", "과로"],                        visual: "a quiet bedroom at night — a glass of water on a bedside table, dim warm lamp" },
  // ── 6순위: 스트레스 / 이완 ────────────────────────────────────────────────
  { kw: ["명상", "호흡"],                        visual: "a quiet indoor corner with soft window light, a small green plant, and a folded cushion" },
  { kw: ["스트레스"],                            visual: "a calm indoor space with warm side-lighting, a small plant, minimal furniture" },
  // ── 7순위: 병원 / 약 ──────────────────────────────────────────────────────
  { kw: ["병원", "검진"],                        visual: "a calm, well-lit Korean clinic examination room interior" },
  { kw: ["처방", "약"],                          visual: "a small white medication tray with a glass of water on a clean nightstand" },
  // ── 8순위: 주제 일반어 (마지막 fallback) ──────────────────────────────────
  { kw: ["지방간"],                              visual: "a glass of cold water and a small bowl of fresh leafy vegetables on a clean kitchen counter" },
  { kw: ["간 수치", "간"],                       visual: "a glass of water and fresh green salad greens on a clean surface" },
  { kw: ["혈압"],                                visual: "a compact home blood pressure monitor on a clean table, screen completely blank" },
];

function extractConcreteVisual(priorityText: string, fallbackText: string): string | null {
  const scan = (t: string): string | null => {
    const lower = t.toLowerCase();
    for (const { kw, visual } of VISUAL_SUBJECTS) {
      if (kw.some((k) => lower.includes(k.toLowerCase()))) return visual;
    }
    return null;
  };
  return scan(priorityText) ?? scan(fallbackText);
}

// ── 카드 인덱스 기반 다양성 사이클 ────────────────────────────────────────────
// cardIndex 1-based → idx = cardIndex - 1 (0-based)

const SHOT_CYCLE: ShotType[] = [
  "wide shot",          // idx 0 (cover)
  "close-up",           // idx 1
  "medium shot",        // idx 2
  "top-down",           // idx 3
  "side profile",       // idx 4
  "over-the-shoulder",  // idx 5
  "detail shot",        // idx 6
];

// 카테고리별 유효 서브젝트 (idx로 순환)
const VALID_SUBJECTS: Record<SceneCategory, SubjectType[]> = {
  cover:           ["person", "environment"],
  concept:         ["object", "mixed", "symbolic"],
  measurement:     ["object", "mixed", "person"],
  habit:           ["person", "object", "environment", "mixed"],
  risk:            ["symbolic", "object", "person"],
  method:          ["person", "mixed", "object"],
  lifestyle:       ["environment", "person", "symbolic"],
  "object-closeup":["object", "mixed"],
  environment:     ["environment", "symbolic"],
  summary:         ["person", "environment", "mixed"],
};

// 카테고리별 유효 세팅 (idx로 순환)
const VALID_SETTINGS: Record<SceneCategory, SceneSetting[]> = {
  cover:           ["Korean home living room", "outdoor park", "morning window light"],
  concept:         ["minimal tabletop scene", "home desk", "morning window light"],
  measurement:     ["Korean home living room", "home desk", "minimal tabletop scene", "morning window light"],
  habit:           ["outdoor park", "Korean kitchen", "Korean home living room", "morning window light"],
  risk:            ["Korean home living room", "evening indoor light", "minimal tabletop scene"],
  method:          ["home desk", "Korean home living room", "clinic consultation room"],
  lifestyle:       ["quiet bedroom", "morning window light", "evening indoor light"],
  "object-closeup":["minimal tabletop scene", "home desk", "morning window light"],
  environment:     ["outdoor park", "quiet bedroom", "morning window light", "Korean kitchen"],
  summary:         ["outdoor park", "Korean home living room", "morning window light"],
};

// ── 카테고리 추론 ──────────────────────────────────────────────────────────────

function inferCategory(all: string): SceneCategory {
  if (has(all, KW.concept))     return "concept";
  if (has(all, KW.routine))     return "method";
  if (has(all, KW.measurement)) return "measurement";
  if (has(all, KW.exercise))    return "habit";
  if (has(all, KW.diet))        return "habit";
  if (has(all, KW.sleep))       return "lifestyle";
  if (has(all, KW.stress))      return "lifestyle";
  if (has(all, KW.caution))     return "risk";
  if (has(all, KW.medical))     return "method";
  if (has(all, KW.general))     return "summary";
  return "summary";
}

function pickByIndex<T>(arr: T[], idx: number): T {
  return arr[idx % arr.length];
}

// ── 액션 설명 ──────────────────────────────────────────────────────────────────
// 카드 본문 핵심어를 추출해 프롬프트 맨 앞에 구체적 피사체로 배치

function buildAction(
  category:    SceneCategory,
  subjectType: SubjectType,
  all:         string,
  topic:       string,
  concrete:    string | null,
): string {
  if (category === "cover") {
    return `A calm, natural Korean adult (South Korean ethnicity) in a serene health-conscious moment — ${topic} atmosphere. Composed and positive. Not posing, completely natural movement. The person is centered or slightly right of center — never on the left side. The subject is large and fills the frame. Rich environmental background fills all corners.`;
  }

  // ── object ─────────────────────────────────────────────────────────────────
  if (subjectType === "object") {
    if (concrete) {
      return `${concrete}. Arranged as a clean still-life. No text, no readable numbers, no labels on any screen or surface.`;
    }
    if (category === "concept" || category === "measurement") {
      return "A single health-related monitoring device on a clean surface. Device screen completely blank, turned off, or unreadable. Minimal objects, ambient natural light.";
    }
    if (has(all, KW.diet))     return "Fresh healthy ingredients — colorful vegetables and grains — on a kitchen counter. No product labels visible.";
    if (has(all, KW.routine))  return "An open health journal with a pen resting on it. No readable handwriting. Warm desk light.";
    if (has(all, KW.sleep))    return "A bedside table with a small lamp and a glass of water. Calm, dim, minimal.";
    if (has(all, KW.exercise)) return "A pair of clean running shoes on a warm wooden floor. Natural window light.";
    return "A carefully arranged health-related everyday object on an uncluttered surface. No text or numbers visible.";
  }

  // ── environment ───────────────────────────────────────────────────────────
  if (subjectType === "environment") {
    if (concrete) {
      return `${concrete}. Wide environmental framing. No person visible — the space itself tells the story.`;
    }
    if (has(all, KW.sleep))    return "A quiet bedroom with soft natural light through curtains. Neatly made bed, minimal decor. No person.";
    if (has(all, KW.exercise)) return "A peaceful tree-lined park path in the morning — dappled light, open green space. No person required.";
    if (has(all, KW.diet))     return "A clean Korean kitchen counter in warm natural light. A few fresh ingredients visible. No person.";
    if (has(all, KW.stress))   return "A serene indoor space — soft window light, a small plant. Calm and unoccupied.";
    return "A calm Korean home interior or outdoor environment suggesting health-conscious daily life. No person required.";
  }

  // ── symbolic — 추상 분위기, concrete 사용 안 함 ───────────────────────────
  if (subjectType === "symbolic") {
    if (category === "risk")   return "Soft directional shadow and warm ambient side-light — calm but cautionary atmosphere. No graphic medical imagery.";
    if (has(all, KW.stress))   return "Diffused light through a sheer curtain, soft leaf shadow pattern — abstract, calming, restorative.";
    if (has(all, KW.concept))  return "Warm soft morning light falling diagonally across a smooth neutral surface — minimal, informative in tone.";
    if (has(all, KW.sleep))    return "A darkened bedroom with a single soft lamp glow — quiet, restorative atmosphere. No person.";
    return "Warm natural tones and soft ambient light hinting at health awareness and quiet wellbeing. Abstract and non-literal.";
  }

  // ── person / mixed ────────────────────────────────────────────────────────
  if (concrete) {
    if (category === "measurement") {
      return `${concrete}. Only a forearm and wrist visible in frame — no full portrait. Device screen blank.`;
    }
    return `${concrete}. A Korean adult (South Korean ethnicity) interacting naturally with this scene — partial view only (hands, side, or back). Not posing.`;
  }

  if (category === "measurement") return "A forearm and wrist resting near a health monitoring device. Partial body only — no full face. Device screen blank or off.";
  if (has(all, KW.exercise))  return "A Korean adult (South Korean ethnicity) walking along a park path. Relaxed, natural movement. Side or back view preferred.";
  if (has(all, KW.routine))   return "Partial view of Korean hands near a health journal — only hands and notebook visible. No readable text on pages.";
  if (has(all, KW.stress))    return "A Korean adult (South Korean ethnicity) sitting quietly, eyes softly closed, calm breathing. Minimal indoor setting, peaceful.";
  if (category === "risk")    return "A middle-aged Korean adult (South Korean ethnicity) with a calm, reflective expression — not alarmed. Quietly thoughtful moment.";
  if (has(all, KW.diet))      return "A Korean adult (South Korean ethnicity) in a kitchen, preparing a simple healthy meal. Natural, unposed. Partial upper body only.";
  if (has(all, KW.sleep))     return "A Korean adult (South Korean ethnicity) waking gently in the morning, calm and rested. Soft bedroom light. Natural expression.";
  return `A natural Korean adult (South Korean ethnicity) in a quiet, health-conscious moment related to ${topic}. Unposed and completely natural.`;
}

// ── 무드 ──────────────────────────────────────────────────────────────────────

function buildMood(category: SceneCategory): string {
  const moods: Record<SceneCategory, string> = {
    cover:           "Warm, premium, trustworthy, hopeful — health magazine cover tone",
    concept:         "Calm, informative, minimal, clean — soft object photography feel",
    measurement:     "Calm, focused, trustworthy — unhurried moment of health awareness",
    habit:           "Positive, energetic yet calm, approachable and healthy",
    risk:            "Calm but cautionary, attentive — not alarming, not dramatic",
    method:          "Organized, structured, reassuring — practical and approachable",
    lifestyle:       "Peaceful, restorative, soft and quiet — healing atmosphere",
    "object-closeup":"Minimal, elegant, focused — detail photography clarity",
    environment:     "Serene, open, natural — health-conscious space",
    summary:         "Hopeful, positive, warm — encouraging and reassuring",
  };
  return moods[category] ?? "Calm, positive, health-conscious";
}

// ── 구도 ──────────────────────────────────────────────────────────────────────

function buildComposition(shotType: ShotType): string {
  const safeEdges   = "Subject fully visible — no cropping at any edge. Subject large and fills the frame.";
  const centerRight = "Main subject centered or slightly right of center. Rich photographic background fills ALL four corners — no empty white or gray area anywhere.";
  const fullFrame   = "The photograph fills the entire frame edge to edge — no blank lower area, no padding, no margin, no caption zone.";

  const comps: Record<ShotType, string> = {
    "wide shot":          `${centerRight} Environmental context richly fills the entire background. Subject prominent, not small. ${safeEdges} ${fullFrame}`,
    "close-up":           `${centerRight} Subject fills 60–70% of the frame. Rich bokeh background — no white void. ${safeEdges} ${fullFrame}`,
    "medium shot":        `${centerRight} Natural depth of field. Subject large and dominant. ${safeEdges} ${fullFrame}`,
    "top-down":           `Pure overhead bird's-eye view. Subject centered on richly textured surface — no plain white background. ${safeEdges} ${fullFrame}`,
    "side profile":       `Pure 90-degree side view. Subject centered-right, fully in frame. Background richly fills all space. ${safeEdges} ${fullFrame}`,
    "over-the-shoulder":  `Camera just behind and slightly above subject. Subject centered-right, fully in frame. Environmental depth fills background richly. ${safeEdges} ${fullFrame}`,
    "detail shot":        `Macro or textural detail, centered or centered-right. Very shallow depth of field — rich bokeh fills background. ${safeEdges} ${fullFrame}`,
  };
  return comps[shotType];
}

// ── 금지 조건 ─────────────────────────────────────────────────────────────────

function buildAvoid(category: SceneCategory, subjectType: SubjectType): string[] {
  const base = [
    // ── 텍스트 금지 ────────────────────────────────────────────────────────
    "text", "letters", "Korean text", "English text", "numbers",
    "logo", "signage", "label", "watermark", "caption", "subtitle",
    "text box", "caption area", "white text panel", "gray text panel",
    "packaging text", "UI text", "screen text", "handwritten text",
    "chart labels", "infographic elements",
    // ── 빈 여백 / 레이아웃 금지 ───────────────────────────────────────────
    "blank bottom area", "white lower panel", "gray lower panel",
    "white border", "gray border", "padding", "margin",
    "letterbox", "pillarbox",
    "poster layout", "collage", "split layout", "composite layout",
    // ── 비율 금지 ─────────────────────────────────────────────────────────
    "landscape image", "square image", "horizontal image",
    // ── 프레이밍 금지 ─────────────────────────────────────────────────────
    "cropped face", "cropped hands", "cut-off object", "cut-off body",
    "subject positioned on the left side of the frame",
    "large empty area on the right side",
    "small subject surrounded by empty space",
    "awkward framing",
  ];
  if (subjectType === "person" || subjectType === "mixed") {
    base.push(
      "person must be Korean ethnicity only — not Japanese, Chinese, or other ethnicities",
    );
  }
  if (subjectType === "object" || subjectType === "environment" || subjectType === "symbolic") {
    base.push("no visible person — or at most partial hands barely in frame if absolutely necessary");
  }
  if (category === "risk") {
    base.push(
      "no graphic medical imagery",
      "no surgery or invasive procedures",
      "no blood or wounds",
      "no exaggerated pain expressions",
      "no alarming or distressing imagery",
    );
  }
  if (category === "concept" || category === "measurement") {
    base.push("device display must be completely blank, turned off, or blurred beyond readability — no numbers on any screen");
  }
  return base;
}

// ── 메인 추론 함수 ─────────────────────────────────────────────────────────────

export function inferSceneFromCardText(params: {
  cardType:     "cover" | "content";
  cardIndex:    number;
  topic:        string;
  title:        string;
  subtitle?:    string;
  intro?:       string;
  highlights?:  string[];
  outro?:       string;
}): CardScene {
  const { cardType, cardIndex, topic, title, subtitle, intro, highlights, outro } = params;
  const all = [title, subtitle, intro, ...(highlights ?? []), outro].filter(Boolean).join(" ");

  const idx = cardIndex - 1; // 0-based for cycling

  if (cardType === "cover") {
    const shotType   = "wide shot" as ShotType;
    const setting    = pickByIndex(VALID_SETTINGS["cover"], idx);
    return {
      category:    "cover",
      subjectType: "person",
      shotType,
      setting,
      action:      buildAction("cover", "person", all, topic, null),
      mood:        buildMood("cover"),
      composition: buildComposition(shotType),
      avoid:       buildAvoid("cover", "person"),
    };
  }

  const category    = inferCategory(all);
  const shotType    = pickByIndex(SHOT_CYCLE, idx);
  const subjectType = pickByIndex(VALID_SUBJECTS[category], idx);
  const setting     = pickByIndex(VALID_SETTINGS[category], idx);
  const primaryText = [title, ...(highlights ?? [])].filter(Boolean).join(" ");
  const concrete    = subjectType !== "symbolic" ? extractConcreteVisual(primaryText, all) : null;

  return {
    category,
    subjectType,
    shotType,
    setting,
    action:      buildAction(category, subjectType, all, topic, concrete),
    mood:        buildMood(category),
    composition: buildComposition(shotType),
    avoid:       buildAvoid(category, subjectType),
  };
}

// ── 프롬프트 조립 ──────────────────────────────────────────────────────────────

export function buildCardImagePrompt(params: {
  cardType:    "cover" | "content";
  cardIndex:   number;
  topic:       string;
  title:       string;
  subtitle?:   string;
  intro?:      string;
  highlights?: string[];
  outro?:      string;
}): { prompt: string; scene: CardScene } {
  const scene = inferSceneFromCardText(params);

  const peopleRule = (scene.subjectType === "person" || scene.subjectType === "mixed")
    ? `PEOPLE: ${KOREAN_PERSON_RULE} Show partial body only — hands, back, or side profile preferred over full frontal portraits.`
    : "PEOPLE: No person in this image. Focus entirely on the specified subject. At most, barely-visible partial hands at the far edge. Never a full portrait or recognizable face.";

  const avoidList = scene.avoid.join("; ");

  // 표지 전용: 전체 프레임을 꽉 채우는 full-bleed 규칙
  const coverFullBleedRule = params.cardType === "cover"
    ? "[MANDATORY — COVER FULL BLEED] This is a COVER image. " +
      "The photograph MUST fill the ENTIRE 1080×1350 frame completely from edge to edge. " +
      "Every pixel must contain rich photographic content — no empty areas, no solid-color bands, no white space, no gray space, no plain void. " +
      "The subject and background together fill all four corners. " +
      "Shoot wide enough that the entire frame is filled with scene content. " +
      "This image will be cover-cropped to 1080×1350 — keep all important content away from the very edge (10% margin)."
    : "";

  const prompt = [
    // ── 0순위: 포맷 (최우선) ──────────────────────────────────────────────
    `[CRITICAL FORMAT] ${OUTPUT_DIMENSIONS_RULE}`,
    coverFullBleedRule,
    "",
    // ── 1순위: 장면 ───────────────────────────────────────────────────────
    "[SCENE]",
    scene.action,
    "",
    // ── 2순위: 촬영 스타일 ────────────────────────────────────────────────
    "[PHOTOGRAPHY STYLE]",
    "Real-life editorial photography. Warm natural light, soft contrast, Korean healthcare lifestyle magazine quality.",
    "THIS IS A PHOTOGRAPH — not an illustration, not a 3D render, not clip-art, not a poster with text panels.",
    "",
    // ── 3순위: 구도 ───────────────────────────────────────────────────────
    "[COMPOSITION]",
    `Shot type: ${scene.shotType}. Setting: ${scene.setting}. Mood: ${scene.mood}.`,
    scene.composition,
    peopleRule,
    "",
    // ── 4순위: 텍스트 절대 금지 ──────────────────────────────────────────
    NO_TEXT_RULE,
    "",
    // ── 5순위: 부정 조건 ──────────────────────────────────────────────────
    `[NEGATIVE] Do NOT include: ${avoidList}; ` +
    "any device or monitor screen with digits; any product packaging label; " +
    "landscape or square photo; letterbox or pillarbox bars; blank bottom area; white or gray lower panel.",
    "",
    // ── 최종 확인 ────────────────────────────────────────────────────────
    `[FINAL VERIFICATION] This image MUST: ` +
    `(1) be a vertical 4:5 portrait photo filling 1080×1350 entirely edge to edge with photographic content, ` +
    `(2) have rich photographic content in EVERY corner including the bottom — no blank lower area whatsoever, ` +
    `(3) contain ZERO text, numbers, or symbols anywhere, ` +
    `(4) have NO white or gray lower panel. ${KOREAN_PERSON_RULE}`,
  ].filter(Boolean).join("\n").trim();

  return { prompt, scene };
}

// ── Gemini 프롬프트 정교화 (placeholder) ──────────────────────────────────────

export async function refineImagePromptWithGemini(
  basePrompt: string,
  _cardText: string,
): Promise<string> {
  return basePrompt;
}

const LLM_STYLE_MARKERS =
  /High-quality realistic photography|warm lighting|cozy interior|lifestyle Korean/i;

/** ContentGenerator(Gemini)가 만든 imagePrompt인지 */
export function isLlmCraftedImageQuery(query: string): boolean {
  const q = query.trim();
  return q.length >= 50 && LLM_STYLE_MARKERS.test(q);
}

/**
 * Gemini가 생성한 imagePrompt를 Imagen/Gemini Image API용 최종 프롬프트로 래핑한다.
 */
export function buildImagenPromptFromLlmQuery(llmImagePrompt: string): string {
  let scene = llmImagePrompt.trim();

  if (!LLM_STYLE_MARKERS.test(scene)) {
    scene =
      "High-quality realistic photography, warm lighting, Korean lifestyle editorial mood. " + scene;
  }
  // 중앙/우측 배치 보정 (LLM 프롬프트에 누락된 경우)
  if (!/centered|center-right/i.test(scene)) {
    scene += " Main subject centered or center-right. Subject fully visible. Rich background fills the entire frame edge to edge — no blank area.";
  }

  return [
    `[CRITICAL FORMAT] ${OUTPUT_DIMENSIONS_RULE}`,
    "",
    "[SCENE]",
    scene,
    "",
    "[PHOTOGRAPHY STYLE]",
    "Real-life editorial photography. Warm natural light, soft contrast, premium Korean lifestyle editorial quality.",
    "THIS IS A PHOTOGRAPH — not an illustration, not a 3D render, not clip-art, not a poster with text panels.",
    "",
    "[COMPOSITION]",
    "Main subject centered or slightly right of center. Rich photographic background fills ALL four corners — no blank area anywhere.",
    KOREAN_PERSON_RULE,
    "",
    NO_TEXT_RULE,
    "",
    "[NEGATIVE] landscape image, square image, horizontal image, letterbox, pillarbox, " +
    "white border, gray border, blank bottom area, white lower panel, gray lower panel, " +
    "caption area, text box, infographic, poster layout, collage, typography overlay, " +
    "cropped subject, subject at edge.",
    "",
    `[FINAL VERIFICATION] Vertical 4:5 portrait photo, 1080×1350px, rich photographic content edge to edge in every corner, ZERO text anywhere.`,
  ].join("\n");
}
