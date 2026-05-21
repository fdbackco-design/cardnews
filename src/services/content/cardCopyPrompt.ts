/**
 * Gemini 카드뉴스 덱 전체 재작성 프롬프트
 */

export const CARD_DECK_SYSTEM_PROMPT = `너는 인스타그램의 인기 '건강 정보 매거진'을 작성하는 전문 카피라이터다.
공급된 웹사이트 원문 HTML/텍스트를 분석하여, 지정된 장수의 카드뉴스 **내용 카드(content)** + **표지 제목** + **표지 이미지 프롬프트**를 JSON으로 재작성해라.

[작성 규칙]
1. 완결된 해요체 사용: 모든 intro, highlights, outro의 문장은 "~요", "~하세요", "~합니다"처럼 어색하지 않고 자연스러운 존댓말로 **완벽히** 마무리한다. 문장이 진행 중인 상태(~원인으로, ~예방 및, ~늘어납니다예요)로 끝내지 마라.
2. 정보 선별 및 압축: 원문의 단순 도입부·배경 설명은 과감히 걷어내고, 독자가 당장 실천할 수 있는 '행동 지침'과 '핵심 정보'를 highlights에 둔다.
3. 엄격한 제목: title은 핵심 명사형으로 딱 떨어지게(최대 15자). 영문 괄호가 중간에 잘리거나 조사(및, 으로, 의)만 붙은 채 끝나지 않게 한다.
   - 나쁜 예: "호흡기세포융합바이러스(RS", "감염 예방 및"
   - 좋은 예: "RS 바이러스 주의", "아침 첫발의 통증"
4. 글자 수(공백 포함, **중간 자르기 금지** — 넘으면 문장 전체를 짧게 다시 쓸 것):
   - intro: 1문장, 25자 이내
   - highlights: 1~2문장, 각 30자 이내
   - outro: 0~1문장, 20자 이내 (없으면 null)

[금지 사항]
- 원문 문장을 잘라 붙이거나 어미만 바꾸지 마라.
- highlights에 명사만 나열하거나 불완전한 절을 넣지 마라.

[올바른 예시]
title: "겨울철 영유아 RS 바이러스"
intro: "겨울철 영유아 호흡기 감염의 가장 흔한 원인입니다."
highlights: ["예방을 위해 흐르는 물에 손 씻기가 가장 중요해요."]
outro: "증상이 있다면 단체 생활을 잠시 쉬어주세요."
imagePrompt: "High-quality realistic photography, warm lighting, cozy interior, lifestyle Korean/Asian mood. Korean mother washing child's hands at a bright sink, main subject on the left leaving empty center space. NO vector icons, NO clip-art, NO text/typography on image."

[이미지 프롬프트 생성 가이드라인]
각 카드의 imagePrompt 필드는 **영문**으로, 해당 카드의 title·intro·highlights·outro 본문과 **100% 맞는** 장면을 묘사한다.

1. 본문 맥락 연관성 (Context Mapping)
   - 본문에 나온 구체적 사물·행동을 묘사한다 (예: 발 스트레칭, 쿠션 신발, 손 씻기).
   - 추상어(의미, 주의)는 물리적 행동·소품으로 바꾼다 (checking health notes on a clean desk).

2. 스타일 톤앤매너 (매 프롬프트에 포함)
   - 반드시 포함: "High-quality realistic photography, warm lighting, cozy interior, lifestyle Korean/Asian mood"

3. 구도 (Composition)
   - 중앙 텍스트 영역을 비우도록: "The main subject is placed on the left side, leaving empty center space" (또는 right side).

4. 금지 (Negative)
   - 반드시 포함: "NO vector icons, NO clip-art, NO text/typography on image, NO pure medical illustrations"

coverImagePrompt: 표지용 1개 — 시리즈 전체 주제를 담은 넓은 장면, 인물은 측면·손·실루엣 위주.

[표지 제목 재작성 규칙 — rewrittenCoverTitle / coverTitleLines]
원문 제목(deckTitle)은 학술적이고 길다. 사람들이 스크롤을 멈추고 클릭하게 만드는 **짧고 정보성 있는** 카드뉴스용 제목으로 다시 작성해라.

1. rewrittenCoverTitle:
   - 공백 포함 16~22자 (목표 20자 내외).
   - 핵심 가치 / 궁금증 유발 / 실행 유도 중 하나의 톤으로.
   - 원문 제목을 그대로 복사하거나, 단순히 잘라쓰지 마라.

2. coverTitleLines:
   - rewrittenCoverTitle을 자연스럽게 1~2줄(권장 2줄)로 분리한 배열.
   - 각 줄은 어절(공백) 경계에서 끊고, 한 줄 5~14자 권장.
   - 조사(및, 으로, 와, 과)만 남은 채 줄을 끊지 마라.

3. 금지 — 광고성·낚시성·의학적 단정 표현:
   - "충격", "절대", "비밀", "마법", "100%", "완치" 등 사용 금지.
   - 원문에 없는 의학적 효과·단정 표현 추가 금지 ("바로 낫는다", "확실하게 예방" 등).
   - 부드러운 호기심 표현은 OK ("'찌릿!'", "잘 크나?", "총정리").

4. 좋은 예 (원문 → 재작성):
   - "임신 중 혈압 관리, 산모와 태아를 지키는 첫걸음"
     → rewrittenCoverTitle: "위험한 임신 중 고혈압, 관리법 총정리"
     → coverTitleLines: ["위험한 임신 중 고혈압,", "관리법 총정리"]
   - "족저근막염: 아침 첫발의 고통, 원인과 대처법"
     → rewrittenCoverTitle: "아침 첫발 '찌릿!' 발바닥 통증 없애는 법"
     → coverTitleLines: ["아침 첫발 '찌릿!'", "발바닥 통증 없애는 법"]
   - "우리 아이 성장 로드맵, 영유아 건강검진으로 완성하세요!"
     → rewrittenCoverTitle: "우리 아이 잘 크나? 영유아 검진의 모든 것"
     → coverTitleLines: ["우리 아이 잘 크나?", "영유아 검진의 모든 것"]`;

/** Gemini responseSchema (Google Generative Language API) */
export const CARD_DECK_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    rewrittenCoverTitle: {
      type: "STRING",
      description:
        "원문 제목을 재작성한 카드뉴스용 표지 제목. 공백 포함 16~22자, 정보성·호기심 유발형. 원문 제목 그대로 복사 금지.",
    },
    coverTitleLines: {
      type: "ARRAY",
      items: { type: "STRING" },
      description:
        "rewrittenCoverTitle을 1~2줄로 자연스럽게 분리한 배열. 권장 2줄, 한 줄 5~14자.",
    },
    coverImagePrompt: {
      type: "STRING",
      description:
        "표지 카드용 영문 이미지 프롬프트. 시리즈 주제·분위기를 담은 wide shot.",
    },
    cards: {
      type: "ARRAY",
      description: "내용 카드 배열. cardIndex 1부터 순서대로.",
      items: {
        type: "OBJECT",
        properties: {
          cardIndex: { type: "INTEGER", description: "1-based 카드 번호" },
          cardType: { type: "STRING", enum: ["content"] },
          title: { type: "STRING", description: "카드 제목, 최대 15자" },
          intro: { type: "STRING", description: "도입 1문장" },
          highlights: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "핵심 실천 요령 1~2문장",
          },
          outro: {
            type: "STRING",
            nullable: true,
            description: "마무리 1문장 또는 null",
          },
          imagePrompt: {
            type: "STRING",
            description:
              "해당 카드 본문과 일치하는 영문 이미지 생성 프롬프트 (스타일·구도·금지 규칙 포함)",
          },
        },
        required: [
          "cardIndex",
          "cardType",
          "title",
          "intro",
          "highlights",
          "imagePrompt",
        ],
      },
    },
  },
  required: [
    "rewrittenCoverTitle",
    "coverTitleLines",
    "coverImagePrompt",
    "cards",
  ],
} as const;

// ── 직접 주제 생성: JSON 응답 스키마 ──────────────────────────────────────────────

/** KDCA 원문 재작성(CARD_DECK_RESPONSE_SCHEMA)과 분리된 직접 주제 생성용 스키마.
 *  sourceArticle(원문 초안) + 카드별 subtitle 필드를 포함하며 글자 수 제약도 완화. */
export const TOPIC_GENERATE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    sourceArticle: {
      type: "OBJECT",
      description: "카드 작성 전 먼저 생성하는 건강정보 원문. 풍부한 내용의 기반 자료.",
      properties: {
        title: { type: "STRING", description: "원문 건강정보 제목" },
        summary: { type: "STRING", description: "전체 요약 1~2문단" },
        sections: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              heading: { type: "STRING", description: "섹션 제목 (예: 원인, 증상, 실천법)" },
              body: { type: "STRING", description: "섹션 본문 200자 이상, 구체적 내용" },
            },
            required: ["heading", "body"],
          },
        },
      },
      required: ["title", "summary", "sections"],
    },
    rewrittenCoverTitle: {
      type: "STRING",
      description: "카드뉴스 표지 제목. 공백 포함 16~22자. 정보성·호기심 유발형. 광고성 표현 금지.",
    },
    coverTitleLines: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "표지 제목을 1~2줄(권장 2줄)로 자연스럽게 분리. 각 줄 5~14자.",
    },
    coverImagePrompt: {
      type: "STRING",
      description: "표지용 영문 이미지 프롬프트. 시리즈 전체 주제를 담은 넓은 장면.",
    },
    cards: {
      type: "ARRAY",
      description: "내용 카드 배열. cardIndex 1부터 순서대로.",
      items: {
        type: "OBJECT",
        properties: {
          cardIndex: { type: "INTEGER", description: "1-based 카드 번호" },
          cardType: { type: "STRING", enum: ["content"] },
          title: { type: "STRING", description: "카드 제목, 2~14자" },
          subtitle: {
            type: "STRING",
            description: "카드 핵심 메시지 한 줄, 10~25자. 카드마다 달라야 함.",
          },
          intro: {
            type: "STRING",
            description: "도입 1문장, 45~80자. 해당 카드의 핵심 주제를 설명하는 완결 문장.",
          },
          highlights: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "핵심 실천/정보 문장 1~2개, 각 35~70자. 카드마다 반드시 다른 내용.",
          },
          outro: {
            type: "STRING",
            nullable: true,
            description: "마무리 1문장, 35~70자, 또는 null",
          },
          imagePrompt: {
            type: "STRING",
            description: "해당 카드 본문과 1:1 대응하는 영문 이미지 프롬프트 (스타일·구도·금지 규칙 포함)",
          },
        },
        required: [
          "cardIndex",
          "cardType",
          "title",
          "subtitle",
          "intro",
          "highlights",
          "imagePrompt",
        ],
      },
    },
  },
  required: [
    "sourceArticle",
    "rewrittenCoverTitle",
    "coverTitleLines",
    "coverImagePrompt",
    "cards",
  ],
} as const;

// ── 직접 주제 생성 시스템 프롬프트 ───────────────────────────────────────────────

export const TOPIC_GENERATE_SYSTEM_PROMPT = `너는 인스타그램의 인기 '건강 정보 매거진' 전문 카피라이터다.
사용자가 제시한 주제로 건강 지식 카드뉴스를 2단계로 작성한다.

━━━ 중요: 반드시 2단계 순서로 작성하라 ━━━

[1단계] sourceArticle 먼저 작성
주제에 대해 질병관리청 건강정보 포털 수준의 충분한 원문을 작성한다.
- 최소 5개 섹션: 정의·왜 중요한가 / 주요 원인 / 증상·주의 신호 / 실천 방법 / 전문가 상담 기준
- 각 섹션 body는 200자 이상, 구체적 수치·행동·빈도 포함
- 이 원문이 빈약하면 카드도 빈약해진다

[2단계] 원문을 기반으로 카드 추출
- 각 카드는 1단계 원문의 다른 섹션을 담당한다
- 카드마다 새로운 핵심 정보가 있어야 한다
- 같은 정보를 다른 표현으로 반복하지 마라

━━━ 카드 구조 ━━━
각 카드는 원문의 특정 섹션에서 추출하며, 아래 역할을 순서대로 배정한다.
(카드 수가 6장이면 1~5 + 마무리, 7장이면 1~6 + 마무리, 8장이면 1~7 + 마무리)

역할 1: 왜 중요한가 — 주제의 영향·중요성, 얼마나 많은 사람에게 해당하는지
역할 2: 주요 원인 — 구체적 원인(식습관·환경·신체 요인 등, 수치 포함 권장)
역할 3: 이런 신호 주의 — 확인 가능한 증상·신호·상황
역할 4: 실천 방법 1 — 바로 적용 가능한 구체적 행동(수치 포함 권장)
역할 5: 실천 방법 2 — 식단·수면·스트레스 등 다른 관점의 실천법
역할 6: 피해야 할 습관 — 악화 요인·주의 사항
역할 7: 전문가 상담 기준 — 언제 병원·전문가를 찾아야 하나
역할 마무리: 전체 핵심 요약 + 구체적 행동 권유

━━━ 텍스트 품질 기준 ━━━
- title: 2~14자
- subtitle: 10~25자, 카드 핵심 메시지 한 줄 (카드마다 달라야 함)
- intro: 45~80자, 해당 카드 주제의 핵심을 설명하는 완결 문장
- highlights: 35~70자, 독자가 바로 실천하거나 기억할 핵심 정보 (카드마다 반드시 다름)
- outro: 35~70자, 보충 정보나 구체적 행동 권유 / 없으면 null

━━━ ⛔ 절대 금지 ━━━
아래 문장 형태를 highlights에 2장 이상 쓰면 자동 실패다.
× "꾸준한 관리가 도움이 됩니다"   × "꾸준한 관리가 중요합니다"
× "건강을 지켜보세요"              × "지금부터 관리해보세요"
× "좋은 습관이 중요합니다"         × "건강을 챙겨보세요"
× "실천이 중요합니다"              × "생활습관을 점검해보세요"

highlights는 카드별 핵심 정보로 달라야 한다.
올바른 예:
  "식후 10분 가벼운 산책이 혈당 급상승을 줄이는 데 도움이 될 수 있어요."
  "늦은 밤 과식은 위산 역류와 수면의 질 저하로 이어질 수 있어요."
  "물 한 컵(200ml)은 포만감 조절과 소화에 도움을 줄 수 있어요."

━━━ 건강정보 작성 원칙 ━━━
1. 의학적 단정 표현 금지: "완치", "반드시 예방", "치료된다", "100% 효과"
2. 일반 건강 정보 수준 (의료 행위 권고 아님)
3. 심각·지속 증상 → 의료기관 방문 권유 문장 포함
4. 완결된 해요체(~해요, ~합니다, ~하세요)

━━━ 이미지 프롬프트 ━━━
각 카드의 imagePrompt는 해당 카드 제목·본문의 구체적 장면과 1:1 대응해야 한다.
예: 카드가 "식후 걷기"면 → 식사 후 공원을 걷는 한국인 성인 장면
예: 카드가 "물 마시기"면 → 식탁 위 물컵 장면
반드시 포함: "High-quality realistic photography, warm lighting, lifestyle Korean/Asian mood"
구도: "main subject on the left leaving empty center space"
금지: "NO vector icons, NO clip-art, NO text/typography on image"
표지 이미지: 시리즈 전체 주제를 담은 넓은 장면, 인물은 측면·손·실루엣 위주.

━━━ 표지 제목 ━━━
- rewrittenCoverTitle: 16~22자, 정보성·호기심 유발, 광고성 표현 금지
- coverTitleLines: 2줄 권장, 각 줄 5~14자, 어절 경계에서 끊기`;

// ── 직접 주제 생성 유저 프롬프트 빌더 ───────────────────────────────────────────

function buildTopicCardStructure(count: number): string {
  const roles = [
    "1. 왜 중요한가 — 주제의 영향·중요성",
    "2. 주요 원인 — 구체적 원인(수치·요인 포함)",
    "3. 이런 신호 주의 — 확인 가능한 증상·신호",
    "4. 실천 방법 1 — 바로 적용 가능한 구체적 행동",
    "5. 실천 방법 2 — 다른 관점의 실천법(식단·수면 등)",
    "6. 피해야 할 습관 — 악화 요인·주의 사항",
    "7. 전문가 상담 기준 — 언제 병원을 가야 하나",
  ];
  const closing = `${count}. 마무리 — 전체 핵심 요약 + 구체적 행동 권유`;
  return [...roles.slice(0, count - 1), closing].join("\n");
}

export function buildTopicGenerateUserPrompt(params: {
  topic: string;
  targetAudience?: string;
  tone?: string;
  referenceText?: string;
  contentCardCount: number;
  validationHints?: string;
}): string {
  const { topic, targetAudience, tone, referenceText, contentCardCount, validationHints } = params;

  const hints = validationHints
    ? `\n\n## ⚠️ 이전 출력 오류 — 반드시 수정하라\n${validationHints}\n`
    : "";

  const refSection = referenceText?.trim()
    ? `\n## 참고 내용 (창작 가이드 — 사실 확인 후 활용)\n${referenceText.trim()}\n`
    : "";

  const cardStructure = buildTopicCardStructure(contentCardCount);

  return `## 카드뉴스 기획 정보
- 주제: ${topic}
- 대상 독자: ${targetAudience || "일반 성인"}
- 톤앤매너: ${tone || "부드럽고 신뢰감 있는 건강정보 카드뉴스"}
- 작성할 내용 카드 수: ${contentCardCount}장 (cardIndex 1 ~ ${contentCardCount})
${refSection}
## 지시사항
**1단계**: sourceArticle을 먼저 작성하라. 최소 5개 섹션, 각 200자 이상의 건강정보 원문을 써라.
**2단계**: 원문을 기반으로 아래 카드 구조에 따라 ${contentCardCount}장을 추출하라.

## 카드 구조 (순서 엄수)
${cardStructure}

## ⛔ 금지 사항 (위반 시 재시도)
- highlights에 "꾸준한 관리가 도움", "건강을 지켜보세요", "실천이 중요합니다" 같은 범용 문구 반복 금지
- 같은 intro·highlight 내용을 다른 카드에서 반복 금지
- 카드마다 반드시 서로 다른 핵심 정보를 담을 것
${hints}`;
}

// ── 원문 기반 재작성 프롬프트 ─────────────────────────────────────────────────────

export function buildDeckRewriteUserPrompt(params: {
  deckTitle: string;
  topic: string;
  contentCardCount: number;
  sourceHtml: string;
  sourceTextFallback: string;
  validationHints?: string;
}): string {
  const htmlBlock =
    params.sourceHtml.length > 0
      ? params.sourceHtml.slice(0, 48_000)
      : params.sourceTextFallback.slice(0, 12_000);

  const hints = params.validationHints
    ? `\n\n## 이전 출력 수정 요청\n${params.validationHints}\n`
    : "";

  return `## 기획 정보
- 시리즈 제목: ${params.deckTitle}
- 토픽 키워드: ${params.topic}
- 작성할 내용 카드 수: ${params.contentCardCount}장 (cardIndex 1 ~ ${params.contentCardCount})

## 원문 HTML (분석 후 재작성할 것)
아래 HTML을 기계적으로 자르지 말고, 의미 단위로 이해한 뒤 카드뉴스 copy를 새로 작성하라.

${htmlBlock}
${hints}`;
}
