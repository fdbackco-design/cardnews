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
사용자가 제시한 **참고 내용(referenceText)**에서 핵심 항목을 추출해 카드별로 분배하는 방식으로 건강 카드뉴스를 작성한다.

━━━ 🔥 작성 알고리즘 — 반드시 이 순서대로 ━━━

[STEP 1] 참고 내용 분석
- 참고 내용을 읽고 **핵심 실천 항목/주의점/구체 행동을 ${"${cardCount-1}"}개 정도 뽑아낸다**.
- 예: "액상과당·야식 줄이기 / 하루 30분 걷기 / 체중 5% 감량 / 식이섬유 늘리기 / 술·흡연 줄이기"
- 단순 도입부·결론·일반론은 항목으로 뽑지 마라.

[STEP 2] 카드별 항목 배정
- 추출한 각 항목 → 카드 1개씩. 마지막 카드만 전체 요약/병원 확인 기준.
- 같은 항목을 두 카드에 쪼개지 마라. 카드 = 항목 1:1.

[STEP 3] 카드별 텍스트 작성
- title: **배정된 항목의 실제 이름**(명사형) 그대로 또는 살짝 다듬어서.
- intro: 그 항목이 왜·어떻게 효과적인지 1문장.
- highlights: 그 항목의 구체적 방법·기준·예시 (수치·재료·시간 포함 권장).
- outro: 그 항목의 보충 팁 또는 시작 방법 (참고 내용에 근거).

━━━ ⛔ 절대 금지 — 위반 시 자동 재시도 ━━━

【제목】 — 템플릿 제목 금지. 참고 내용의 실제 항목명을 써라.
× 나쁜 제목: "주요 원인", "실천 방법 1", "실천 방법 2", "이런 신호 주의",
             "왜 중요한가", "전문가 상담", "오늘의 한 가지", "핵심 1", "문제 인식",
             "생활 속 관리", "몸의 소리에 귀 기울여요", "다음 식사 조절"
◯ 좋은 제목: "나쁜 지방 줄이기", "식이섬유 늘리기", "체중 5% 감량",
             "하루 30분 걷기", "술·흡연 줄이기", "병원 확인 기준",
             "액상과당 줄이기", "야식 줄이기", "통곡물로 바꾸기"

【intro】 — 주제명으로 문장을 시작하지 마라.
× 나쁜 시작: "고지혈증은(는) ...", "고지혈증이 ...", "이 주제는 ...",
             "{topic}와 관련된 ...", "{topic}에 대해 ..."
◯ 좋은 시작: "달달한 음료와 야식은 중성지방을 흔들기 쉽습니다.",
             "빠르게 걷기는 중성지방 관리에 도움이 됩니다.",
             "귀리·현미·콩류·채소는 식이섬유 섭취에 좋습니다."

【범용 문구】 — 어디에도 쓰지 마라 (단 1회 등장만으로도 실패).
× "꾸준한 관리가 도움이 됩니다"   × "꾸준한 관리가 중요합니다"
× "건강을 지켜보세요"              × "지금부터 관리해보세요"
× "좋은 습관이 중요합니다"         × "건강을 챙겨보세요"
× "실천이 중요합니다"              × "관리가 중요합니다"
× "오늘부터 관심을 가져보세요"     × "건강한 습관을 길러요"
× "생활습관을 점검해보세요"        × "오늘부터 실천해보세요"
× "전문가와 상담해 보세요" (참고 내용에 의료 권유가 명시되어 있을 때만 허용)

【의학 단정】 참고 내용에 없는 효과·수치·메커니즘 금지.
× 참고 내용에 "산책이 좋다"만 있는데 "혈당 30% 감소"라고 쓰면 위반.
× "완치", "반드시 예방", "100% 효과", "치료된다" 금지.

【intro/highlight/outro 의미 중복】 한 카드 안에서도, 카드 간에도 같은 의미 반복 금지.

━━━ ✅ 올바른 카드 예시 (referenceText = 고지혈증 피하는 법인 경우) ━━━

카드 1:
  title: "액상과당 줄이기"
  intro: "달달한 음료와 야식은 중성지방을 흔들기 쉽습니다."
  highlights: ["음료·야식부터 줄이는 게 우선입니다."]
  outro: "물이나 무가당 음료로 바꿔보세요."

카드 2:
  title: "하루 30분 걷기"
  intro: "빠르게 걷기는 중성지방 관리에 도움이 됩니다."
  highlights: ["하루 30분, 주 5회를 목표로 해보세요."]
  outro: "짧은 산책부터 시작해도 좋습니다."

카드 3:
  title: "식이섬유 늘리기"
  intro: "귀리·현미·콩류·채소는 식이섬유 섭취에 좋습니다."
  highlights: ["식이섬유는 콜레스테롤 배출에 도움됩니다."]
  outro: "흰빵보다 통곡물부터 바꿔보세요."

→ 모든 카드의 title·intro·highlights·outro가 서로 다르고, 각각 참고 내용의 구체적 항목 하나에 집중.

━━━ 텍스트 길이·형식 ━━━
- title: 2~14자, 명사형 (행동·항목명)
- subtitle: 10~25자, 카드의 한 줄 핵심 메시지 — 카드마다 달라야 함
- intro: 45~80자, 해당 항목이 왜·어떻게 효과적인지 1문장
- highlights: 1개 권장(최대 2개), 각 35~70자, 카드마다 반드시 다른 내용
- outro: 35~70자, 해당 항목의 보충 팁 / 없으면 null
- 모든 문장은 완결된 해요체(~해요, ~합니다, ~하세요).

━━━ 🖼️ 이미지 프롬프트 (referenceText 기반) ━━━
imagePrompt는 해당 카드 제목·본문이 다루는 **실제 행동·소품·장소**와 1:1 대응한다.

예 (고지혈증 카드별):
  "나쁜 지방 줄이기" → "Korean dining table with fried processed food replaced by grilled fish and vegetables, warm light"
  "식이섬유 늘리기" → "Bowl of oats, brown rice, beans and fresh vegetables on a Korean table, soft morning light"
  "하루 30분 걷기" → "Korean adult walking in a park after work, warm natural light, casual sportswear"
  "술·흡연 줄이기" → "Calm table with non-alcoholic drink and water glass, no alcohol branding, healthy lifestyle mood"
  "병원 확인 기준" → "Calm clinic consultation scene, doctor and adult patient discussing health check results, no readable text on monitor"

× 추상적 건강 이미지("healthy lifestyle", "abstract wellness", "health icons") 금지
× 의학 일러스트, 벡터 아이콘, 그래픽, 이미지 안 텍스트·숫자·로고 금지

반드시 포함: "High-quality realistic photography, warm lighting, lifestyle Korean/Asian mood"
구도: "main subject on the left leaving empty center space"
금지 구문: "NO vector icons, NO clip-art, NO text/typography on image, NO numbers, NO logos"

표지(coverImagePrompt): 시리즈 전체 주제를 담은 넓은 실사 장면, 인물은 측면·손·실루엣 위주.

━━━ 표지 제목 ━━━
- rewrittenCoverTitle: 16~22자, 정보성·호기심 유발, 광고성 표현 금지
- coverTitleLines: 2줄 권장, 각 줄 5~14자, 어절 경계에서 끊기`;

// ── 직접 주제 생성 유저 프롬프트 빌더 ───────────────────────────────────────────

export function buildTopicGenerateUserPrompt(params: {
  topic: string;
  targetAudience?: string;
  tone?: string;
  referenceText?: string;
  contentCardCount: number;
  validationHints?: string;
}): string {
  const { topic, targetAudience, tone, referenceText, contentCardCount, validationHints } =
    params;

  const hints = validationHints
    ? `\n\n## ⚠️ 이전 출력 오류 — 반드시 모두 수정하라\n${validationHints}\n`
    : "";

  const trimmedRef = referenceText?.trim() ?? "";
  const hasReference = trimmedRef.length > 0;

  // 참고 내용이 없을 때는 최소한의 폴백(이제는 거의 발생 안 함 — 프론트/서버에서 차단).
  if (!hasReference) {
    return `## 카드뉴스 기획 정보
- 주제: ${topic}
- 대상 독자: ${targetAudience || "일반 성인"}
- 톤앤매너: ${tone || "부드럽고 신뢰감 있는 건강정보 카드뉴스"}
- 작성할 내용 카드 수: ${contentCardCount}장 (cardIndex 1 ~ ${contentCardCount})

⚠️ 참고 내용(referenceText)이 제공되지 않았다. 일반 건강 상식 범위 내에서만 작성하고,
구체적 수치·효과를 단정하지 마라. 카드 제목은 절대 "실천 방법 1", "주요 원인" 같은
템플릿 형태로 짓지 마라 — 구체적 행동/항목명으로 지어라.
${hints}`;
  }

  const contentItemCount = Math.max(1, contentCardCount - 1);

  return `# 🔥 필수 근거: 참고 내용 (referenceText)
아래 텍스트가 카드뉴스의 **단 하나뿐인 사실 근거**다. 모든 본문은 이 내용에서 도출하라.

\`\`\`
${trimmedRef}
\`\`\`

## 카드뉴스 기획 정보
- 주제: ${topic}
- 대상 독자: ${targetAudience || "일반 성인"}
- 톤앤매너: ${tone || "부드럽고 신뢰감 있는 건강정보 카드뉴스"}
- 작성할 내용 카드 수: ${contentCardCount}장 (cardIndex 1 ~ ${contentCardCount})

## 🎯 작성 알고리즘 — 반드시 이 순서로 실행하라

### STEP 1: sourceArticle 작성 (참고 내용 재구성)
참고 내용을 그대로 정리·재구성해서 sourceArticle을 만들어라.
- 새 정보를 발명하지 마라. 참고 내용을 풀어쓰는 정도까지만 허용.
- 참고 내용에 없는 효과·수치·메커니즘 추가 금지.

### STEP 2: 카드 ${contentCardCount}장 구성 — 항목 추출 + 1:1 배정
1. sourceArticle에서 **구체적 실천 항목/주의점 ${contentItemCount}개**를 뽑아라.
   (단순 도입부·결론·일반론은 제외)
2. 카드 1~${contentItemCount}는 각 항목 하나씩 다룬다 — **카드 = 항목 1:1**.
3. 카드 ${contentCardCount}는 마무리 (전체 요약 + 시작할 실천 한 가지 추천,
   또는 참고 내용에 의료 권유가 있다면 병원 확인 기준).

### STEP 3: 각 카드 텍스트 작성
- title: **배정된 항목의 실제 이름**을 명사형으로. 템플릿 제목 금지.
- intro: 그 항목이 왜·어떻게 효과적인지 1문장. **주제명("${topic}은/는") 으로 시작 금지**.
- highlights: 그 항목의 구체적 방법·기준·예시 (수치·재료·시간 포함 권장) 1개.
- outro: 그 항목의 보충 팁 또는 시작 방법 (참고 내용 근거) — 없으면 null.

## ⛔ 위반 시 자동 재시도 (단 1회 등장만으로 실패)
1. title이 다음 중 하나면 실패: "실천 방법 1/2/3", "주요 원인", "이런 신호 주의",
   "왜 중요한가", "전문가 상담", "오늘의 한 가지", "핵심 N", "문제 인식", "생활 속 관리"
2. intro가 "${topic}은", "${topic}는", "${topic}이", "${topic}가", "이 주제" 로 시작하면 실패
3. 다음 범용 문구가 어디든 1회만 나와도 실패:
   "꾸준한 관리가 도움이 됩니다", "건강을 지켜보세요", "관리가 중요합니다",
   "오늘부터 관심을 가져보세요", "건강한 습관을 길러요", "오늘부터 실천해보세요",
   "생활습관을 점검해보세요", "꾸준한 관리가 중요합니다"
4. 같은 highlight 또는 outro가 2회 이상 반복되면 실패
5. 참고 내용에 없는 의학적 효과·수치·단정 표현이 들어가면 실패

## 🖼️ imagePrompt 규칙
각 카드의 imagePrompt는 그 카드 title·intro에 등장한 **실제 행동/소품/장소**를 묘사해야 한다.
추상적 "healthy lifestyle"만 쓰면 실패. 이미지 안 텍스트·숫자·로고 금지.
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
