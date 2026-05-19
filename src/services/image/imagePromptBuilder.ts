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
    return `A calm, natural Korean or East Asian adult in a serene health-conscious moment — ${topic} atmosphere. Composed and positive. Not posing, completely natural movement.`;
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
    return `${concrete}. A Korean or East Asian adult interacting naturally with this scene — partial view only (hands, side, or back). Not posing.`;
  }

  if (category === "measurement") return "A forearm and wrist resting near a health monitoring device. Partial body only — no full face. Device screen blank or off.";
  if (has(all, KW.exercise))  return "A Korean or East Asian adult walking along a park path. Relaxed, natural movement. Side or back view preferred.";
  if (has(all, KW.routine))   return "Partial view of hands writing in a health journal — only hands and notebook visible. No readable text.";
  if (has(all, KW.stress))    return "A Korean or East Asian adult sitting quietly, eyes softly closed, calm breathing. Minimal indoor setting, peaceful.";
  if (category === "risk")    return "A middle-aged Korean adult with a calm, reflective expression — not alarmed. Quietly thoughtful moment.";
  if (has(all, KW.diet))      return "A Korean adult in a kitchen, preparing a simple healthy meal. Natural, unposed. Partial upper body only.";
  if (has(all, KW.sleep))     return "A Korean adult waking gently in the morning, calm and rested. Soft bedroom light. Natural expression.";
  return `A natural Korean or East Asian adult in a quiet, health-conscious moment related to ${topic}. Unposed and completely natural.`;
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
  const safe = "Reserve dark or clean empty space on the LEFT and BOTTOM edges for Korean white text overlay.";
  const comps: Record<ShotType, string> = {
    "wide shot":          `Subject in the lower-third or right-third of the frame. Generous empty space on the left and upper area for title text. ${safe}`,
    "close-up":           `Main subject fills the right half of the frame. Soft background bokeh. No clutter in the left third. ${safe}`,
    "medium shot":        `Subject right-of-center. Natural depth of field. Slight diagonal angle. Left side open. ${safe}`,
    "top-down":           `Pure overhead bird's-eye view. Subject centered or slightly right on a clean flat surface. Symmetrical or slightly diagonal. ${safe}`,
    "side profile":       `Pure 90-degree side view. Subject facing right, occupying right half of frame. Strong horizontal line. ${safe}`,
    "over-the-shoulder":  `Camera positioned just behind and above the subject's shoulder. Depth leads the eye into the scene. Subject and background fill right half. ${safe}`,
    "detail shot":        `Extreme macro or textural detail. Very shallow depth of field — main element sharp, background blurred. Subject on the right side. ${safe}`,
  };
  return comps[shotType];
}

// ── 금지 조건 ─────────────────────────────────────────────────────────────────

function buildAvoid(category: SceneCategory, subjectType: SubjectType): string[] {
  const base = [
    "no readable text of any kind",
    "no Korean letters or characters",
    "no English letters",
    "no Arabic numerals",
    "no logos or brand marks",
    "no product packaging with visible labels",
    "no charts or graphs",
    "no visible UI screens with any content",
    "no captions or subtitles",
    "no signboards or street signs",
  ];
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
    ? "PEOPLE: A Korean or East Asian adult may appear. Show partial body only — hands, back, or side profile preferred over full frontal portraits. Vary appearance across different cards in this set."
    : "PEOPLE: No person needed for this image. Focus entirely on the specified subject. At most, barely-visible partial hands at the far edge. Never a full portrait or recognizable face.";

  const avoidList = scene.avoid.join("; ");

  const prompt = [
    // ── 1순위: 핵심 피사체 (모델이 가장 먼저 읽고 가장 크게 반영) ───────────
    scene.action,
    "",
    // ── 2순위: 촬영 방식 — 사진 한정, 일러스트/3D 즉시 금지 ──────────────────
    "PHOTOGRAPHY STYLE: Real-life editorial photography. Warm natural light, soft contrast, Korean/East Asian healthcare lifestyle magazine quality.",
    "THIS IS A PHOTOGRAPH — NOT an illustration, NOT a 3D render, NOT clip-art, NOT a vector graphic, NOT an icon, NOT a medical diagram, NOT an infographic.",
    "",
    // ── 3순위: 기술 파라미터 ───────────────────────────────────────────────
    `Shot type: ${scene.shotType}`,
    `Setting: ${scene.setting}`,
    `Mood: ${scene.mood}`,
    `Composition: ${scene.composition}`,
    "",
    // ── 인물 규칙 ─────────────────────────────────────────────────────────
    peopleRule,
    "",
    // ── CRITICAL 금지 규칙 ────────────────────────────────────────────────
    "[CRITICAL — STRICTLY ENFORCED]",
    "Real-life photography ONLY. Absolutely no vector icons, no clip-art, no 3D-rendered objects, no anatomical or medical diagrams, no infographics, no cartoon-style or illustrative imagery.",
    `No text or numbers of any kind: ${avoidList}.`,
    "Any screen, device display, or monitor MUST be completely blank and turned off — zero digits or characters visible.",
    "Any product, food package, or bottle MUST have unreadable or absent labels.",
    "",
    // ── 출력 규격 ─────────────────────────────────────────────────────────
    "OUTPUT: Vertical portrait format, 1080×1350 px (4:5 ratio). Reserve empty dark or clean negative space on the LEFT and BOTTOM edges for white Korean text overlay.",
  ].join("\n").trim();

  return { prompt, scene };
}

// ── Gemini 프롬프트 정교화 (placeholder) ──────────────────────────────────────

export async function refineImagePromptWithGemini(
  basePrompt: string,
  _cardText: string,
): Promise<string> {
  return basePrompt;
}
