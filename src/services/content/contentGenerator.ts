import * as dotenv from "dotenv";

import type { ContentCard } from "../../types/cardnews";
import type { KdcaContent } from "../../types/cardnews";
import { buildVisualImageQuery } from "../../utils/text";
import {
  buildDeckRewriteUserPrompt,
  buildTopicGenerateUserPrompt,
  CARD_DECK_RESPONSE_SCHEMA,
  CARD_DECK_SYSTEM_PROMPT,
  TOPIC_GENERATE_RESPONSE_SCHEMA,
  TOPIC_GENERATE_SYSTEM_PROMPT,
} from "./cardCopyPrompt";
import { fallbackSectionToCardCopy } from "./cardCopyFallback";
import { repairCardCopy } from "./cardCopyRepair";
import {
  type CardCopyFields,
  isBrokenKorean,
  validateCardCopy,
  validateCardNewsDeck,
} from "./cardCopyValidator";
import {
  buildFallbackCoverTitle,
  splitCoverTitleToLines,
  validateCoverTitle,
} from "./coverTitle";

dotenv.config();

export type GeneratedCardCopy = CardCopyFields & {
  index: number;
  subtitle?: string;
  imagePrompt: string;
};

export type GeneratedDeckFromLlm = {
  /** Gemini가 재작성한 표지 제목 (전체 문자열) */
  coverTitle: string;
  /** 표지 제목을 1~2줄로 분리한 배열 */
  coverTitleLines: string[];
  coverImagePrompt: string;
  contentCards: GeneratedCardCopy[];
};

type LlmDeckCard = {
  cardIndex?: number;
  cardType?: string;
  title?: string;
  subtitle?: string;
  intro?: string;
  highlights?: string | string[];
  outro?: string | null;
  imagePrompt?: string;
};

type LlmDeckResponse = {
  rewrittenCoverTitle?: string;
  coverTitleLines?: string[] | string;
  coverImagePrompt?: string;
  sourceArticle?: { title?: string; summary?: string; sections?: { heading?: string; body?: string }[] };
  cards?: LlmDeckCard[];
};

const MAX_ATTEMPTS = 3;

const IMAGE_PROMPT_STYLE =
  "High-quality realistic photography, warm lighting, cozy interior, lifestyle Korean/Asian mood";
const IMAGE_PROMPT_NEGATIVE =
  "NO vector icons, NO clip-art, NO text/typography on image, NO pure medical illustrations";
const IMAGE_PROMPT_COMPOSITION =
  "The main subject is placed on the left side, leaving empty center space for text overlay";

export function isContentLlmEnabled(): boolean {
  if (process.env["CONTENT_GENERATOR"] === "off") return false;
  if (process.env["CONTENT_GENERATOR"] === "rule") return false;
  return Boolean(process.env["GEMINI_API_KEY"]?.trim());
}

function resolveTextModel(): string {
  return (
    process.env["CONTENT_GENERATOR_MODEL"] ??
    process.env["GEMINI_MODEL"] ??
    "gemini-1.5-flash"
  );
}

function parseJsonFromLlm(raw: string): LlmDeckResponse {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(jsonText) as LlmDeckResponse;
}

function normalizeHighlights(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((h) => String(h).trim()).filter(Boolean).slice(0, 2);
  }
  const s = String(value).trim();
  if (!s) return [];
  if (s.includes("\n")) {
    return s
      .split(/\n+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 2);
  }
  return [s];
}

/** LLM·fallback 공통 — 본문 맥락 기반 영문 imagePrompt (최소 품질 보장) */
export function buildFallbackImagePrompt(params: {
  title: string;
  intro?: string;
  highlights?: string[];
  outro?: string;
  topic: string;
  cardIndex: number;
  isCover?: boolean;
}): string {
  const { title, intro, highlights, outro, topic, cardIndex, isCover } = params;

  if (isCover) {
    return [
      IMAGE_PROMPT_STYLE + ".",
      `Korean adult in a calm home interior scene related to ${topic}, warm morning window light.`,
      "Wide shot, subject on the left side leaving empty center space.",
      IMAGE_PROMPT_NEGATIVE + ".",
    ].join(" ");
  }

  const visual = buildVisualImageQuery(
    title,
    title,
    [intro, ...(highlights ?? []), outro].filter(Boolean).join(" "),
    cardIndex
  );

  return [
    IMAGE_PROMPT_STYLE + ".",
    `${visual}.`,
    IMAGE_PROMPT_COMPOSITION + ".",
    IMAGE_PROMPT_NEGATIVE + ".",
  ].join(" ");
}

function normalizeImagePrompt(
  raw: string | undefined,
  fallback: string
): string {
  const p = String(raw ?? "").trim();
  if (p.length < 40) return fallback;
  if (!/[a-zA-Z]/.test(p)) return fallback;
  return p;
}

function normalizeCoverTitleLines(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (s.includes("\n")) {
      return s.split(/\n+/).map((x) => x.trim()).filter(Boolean);
    }
    return [s];
  }
  return [];
}

/**
 * Gemini 응답에서 표지 제목/라인을 추출 → 검증 → 통과 시 그대로 사용,
 * 실패 시 원문 제목 기반 폴백.
 */
function resolveCoverTitle(
  rewritten: string | undefined,
  lines: unknown,
  originalTitle: string
): { title: string; lines: string[]; errors: string[] } {
  const rewrittenTitle = String(rewritten ?? "").trim();
  const candidateLines = normalizeCoverTitleLines(lines);
  const errors: string[] = [];

  const titleErrors = validateCoverTitle(rewrittenTitle, originalTitle);
  errors.push(...titleErrors);

  if (titleErrors.length > 0) {
    const fb = buildFallbackCoverTitle(originalTitle);
    return { title: fb.title, lines: fb.lines, errors };
  }

  const finalLines =
    candidateLines.length > 0
      ? candidateLines
      : splitCoverTitleToLines(rewrittenTitle);

  return { title: rewrittenTitle, lines: finalLines, errors };
}

function normalizeLlmDeckCard(
  raw: LlmDeckCard,
  cardIndex: number,
  topic: string
): GeneratedCardCopy {
  const fallbackCopy = fallbackSectionToCardCopy("", raw.title ?? "");
  const repaired = repairCardCopy(
    {
      title: String(raw.title ?? fallbackCopy.title).trim() || fallbackCopy.title,
      intro: String(raw.intro ?? fallbackCopy.intro).trim() || fallbackCopy.intro,
      highlights: normalizeHighlights(raw.highlights).length
        ? normalizeHighlights(raw.highlights)
        : fallbackCopy.highlights,
      outro: raw.outro == null ? undefined : String(raw.outro).trim() || undefined,
    },
    raw.title ?? ""
  );

  const imagePrompt = normalizeImagePrompt(
    raw.imagePrompt,
    buildFallbackImagePrompt({
      title: repaired.title,
      intro: repaired.intro,
      highlights: repaired.highlights,
      outro: repaired.outro,
      topic,
      cardIndex,
    })
  );

  const subtitle = raw.subtitle?.trim() || undefined;
  return { index: cardIndex, subtitle, ...repaired, imagePrompt };
}

async function callGeminiDeckRewrite(
  userPrompt: string,
  systemPrompt: string,
  responseSchema: unknown = CARD_DECK_RESPONSE_SCHEMA
): Promise<string> {
  const apiKey = process.env["GEMINI_API_KEY"] ?? "";
  const model = resolveTextModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini 응답 본문이 비어 있습니다.");
  return text;
}

/**
 * 원문 HTML 전체 → Gemini JSON(텍스트 + imagePrompt) 덱 재작성.
 */
export async function generateCardNewsFromSource(params: {
  source: KdcaContent;
  topic: string;
  contentCardCount: number;
}): Promise<GeneratedDeckFromLlm> {
  const { source, topic, contentCardCount } = params;
  const deckTitle = source.title || topic;
  const sourceHtml = source.sourceHtml ?? "";
  const sourceTextFallback = source.rawText || source.sections.map((s) => s.body).join("\n\n");

  if (!isContentLlmEnabled()) {
    console.log("[ContentGenerator] LLM 비활성 — rule fallback");
    return ruleFallbackDeck(source, topic, contentCardCount, deckTitle);
  }

  let validationHints: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const userPrompt = buildDeckRewriteUserPrompt({
        deckTitle,
        topic,
        contentCardCount,
        sourceHtml,
        sourceTextFallback,
        validationHints,
      });

      console.log(
        `[ContentGenerator] Gemini 덱 재작성 ${attempt}/${MAX_ATTEMPTS} ` +
          `(카드 ${contentCardCount}장 + 표지 imagePrompt, HTML ${sourceHtml.length}자, model=${resolveTextModel()})`
      );

      const rawText = await callGeminiDeckRewrite(userPrompt, CARD_DECK_SYSTEM_PROMPT);
      const parsed = parseJsonFromLlm(rawText);
      const rawCards = parsed.cards ?? [];

      if (rawCards.length < contentCardCount) {
        throw new Error(
          `카드 수 부족: 요청 ${contentCardCount}장, 응답 ${rawCards.length}장`
        );
      }

      const contentCards: GeneratedCardCopy[] = [];
      for (let i = 0; i < contentCardCount; i++) {
        const cardIndex = i + 1;
        const match =
          rawCards.find((c) => c.cardIndex === cardIndex) ?? rawCards[i];
        contentCards.push(normalizeLlmDeckCard(match ?? {}, cardIndex, topic));
      }

      const coverImagePrompt = normalizeImagePrompt(
        parsed.coverImagePrompt,
        buildFallbackImagePrompt({
          title: deckTitle,
          topic,
          cardIndex: 0,
          isCover: true,
        })
      );

      const coverResolved = resolveCoverTitle(
        parsed.rewrittenCoverTitle,
        parsed.coverTitleLines,
        deckTitle
      );
      if (coverResolved.errors.length > 0) {
        console.warn(
          `[ContentGenerator] 표지 제목 검증 실패 → 폴백 적용:\n  - ${coverResolved.errors.join(
            "\n  - "
          )}`
        );
      } else {
        console.log(
          `[ContentGenerator] 표지 제목 재작성 적용: "${coverResolved.title}" (${coverResolved.lines.length}줄)`
        );
      }

      const deck: GeneratedDeckFromLlm = {
        coverTitle: coverResolved.title,
        coverTitleLines: coverResolved.lines,
        coverImagePrompt,
        contentCards,
      };

      const { ok, errors } = validateCardNewsDeck(contentCards);
      const hasBroken = contentCards.some(
        (r) =>
          isBrokenKorean(r.intro) ||
          isBrokenKorean(r.title) ||
          (r.highlights ?? []).some(isBrokenKorean) ||
          (r.outro ? isBrokenKorean(r.outro) : false)
      );

      if (ok) {
        console.log("[ContentGenerator] 검증 통과 — Gemini 텍스트+imagePrompt 적용");
        logImagePrompts(deck);
        return deck;
      }

      if (!hasBroken) {
        console.warn(
          `[ContentGenerator] 길이 경고만 있음 — Gemini 덱 적용 (시도 ${attempt})`
        );
        logCardCopyValidation(contentCards);
        logImagePrompts(deck);
        return deck;
      }

      validationHints = errors.join("\n");
      console.warn(`[ContentGenerator] 검증 실패:\n${validationHints}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ContentGenerator] 시도 ${attempt} 오류: ${msg}`);
      validationHints = msg;
    }
  }

  console.warn("[ContentGenerator] Gemini 최종 실패 — rule fallback");
  return ruleFallbackDeck(source, topic, contentCardCount, deckTitle);
}

function ruleFallbackDeck(
  source: KdcaContent,
  topic: string,
  contentCardCount: number,
  deckTitle: string
): GeneratedDeckFromLlm {
  const sections = source.sections.filter((s) => s.body.trim().length >= 20);
  const picked = sections.slice(0, contentCardCount);
  const contentCards: GeneratedCardCopy[] = [];

  for (let i = 0; i < contentCardCount; i++) {
    const s = picked[i];
    const copy = s
      ? fallbackSectionToCardCopy(s.body, s.heading ?? "")
      : fallbackSectionToCardCopy(source.rawText.slice(0, 400), source.title);
    const cardIndex = i + 1;
    contentCards.push({
      index: cardIndex,
      ...copy,
      imagePrompt: buildFallbackImagePrompt({
        title: copy.title,
        intro: copy.intro,
        highlights: copy.highlights,
        outro: copy.outro,
        topic,
        cardIndex,
      }),
    });
  }

  const fb = buildFallbackCoverTitle(deckTitle);
  console.log(
    `[ContentGenerator] 표지 제목 폴백 적용: "${fb.title}" (${fb.lines.length}줄)`
  );

  return {
    coverTitle: fb.title,
    coverTitleLines: fb.lines,
    coverImagePrompt: buildFallbackImagePrompt({
      title: deckTitle,
      topic,
      cardIndex: 0,
      isCover: true,
    }),
    contentCards,
  };
}

function logImagePrompts(deck: GeneratedDeckFromLlm): void {
  console.log(
    `[ContentGenerator] 표지 제목: "${deck.coverTitle}" → [${deck.coverTitleLines
      .map((l) => `"${l}"`)
      .join(", ")}]`
  );
  console.log("[ContentGenerator] imagePrompt 미리보기:");
  console.log(`  [표지] ${deck.coverImagePrompt.slice(0, 100)}…`);
  deck.contentCards.forEach((c) => {
    console.log(`  [카드 ${c.index}] ${c.imagePrompt.slice(0, 90)}…`);
  });
}

/** LLM 카피 → ContentCard — imageQuery에 Gemini imagePrompt 연결 */
export function toContentCard(
  copy: GeneratedCardCopy,
  i: number,
  topic: string,
  pattern: "narrative" | "list",
  _bodyForImage: string
): ContentCard {
  const highlights =
    copy.highlights && copy.highlights.length > 0 ? copy.highlights : undefined;

  const base: ContentCard = {
    type: "content",
    index: i + 1,
    title: copy.title,
    subtitle: copy.subtitle,
    intro: copy.intro,
    highlights,
    outro: copy.outro,
    imageQuery: copy.imagePrompt,
  };

  if (pattern === "list" && highlights) {
    return { ...base, highlights: undefined, bullets: highlights };
  }
  return base;
}

/** @deprecated — `generateCardNewsFromSource` 사용 */
export async function generateCardCopiesFromSections(params: {
  deckTitle: string;
  topic: string;
  sections: KdcaContent["sections"];
}): Promise<GeneratedCardCopy[]> {
  const deck = await generateCardNewsFromSource({
    source: {
      contentId: "legacy",
      sourceUrl: "",
      title: params.deckTitle,
      sections: params.sections,
      rawText: params.sections.map((s) => s.body).join("\n\n"),
    },
    topic: params.topic,
    contentCardCount: params.sections.length,
  });
  return deck.contentCards;
}

export function logCardCopyValidation(cards: CardCopyFields[]): void {
  const { ok, errors } = validateCardNewsDeck(cards);
  if (ok) {
    console.log("[ContentGenerator] 최종 카피 검증: 통과");
    return;
  }
  console.warn("[ContentGenerator] 최종 카피 검증 경고:");
  errors.forEach((e) => console.warn(`  - ${e}`));
}

// ── 직접 주제 생성 전용 상수·검증 ───────────────────────────────────────────────

const GENERIC_PHRASES_DENY = [
  "꾸준한 관리가 도움이 됩니다",
  "꾸준한 관리가 중요합니다",
  "꾸준히 관리가 도움",
  "건강을 지켜보세요",
  "지금부터 관리해보세요",
  "좋은 습관이 중요합니다",
  "건강을 챙겨보세요",
  "실천이 중요합니다",
  "생활습관을 점검해보세요",
];

function validateTopicDeckUniqueness(cards: GeneratedCardCopy[]): string[] {
  const errors: string[] = [];

  // 중복 intro 검사
  const introSet = new Set<string>();
  for (let i = 0; i < cards.length; i++) {
    const intro = (cards[i]?.intro ?? "").trim();
    if (introSet.has(intro)) {
      errors.push(`[카드 ${i + 1}] intro가 이전 카드와 중복: "${intro.slice(0, 30)}"`);
    } else {
      introSet.add(intro);
    }
  }

  // 중복 highlight 검사
  const hlCount = new Map<string, number>();
  for (const card of cards) {
    for (const h of card.highlights ?? []) {
      const key = h.trim();
      hlCount.set(key, (hlCount.get(key) ?? 0) + 1);
    }
  }
  for (const [h, count] of hlCount) {
    if (count >= 2) {
      errors.push(`highlight 중복 ${count}회: "${h.slice(0, 40)}"`);
    }
  }

  // 금지 범용 문구 반복 검사 (2회 이상 등장 시 실패)
  const genericCount = new Map<string, number>();
  for (const card of cards) {
    const allText = [card.intro, ...(card.highlights ?? []), card.outro ?? ""].join(" ");
    for (const phrase of GENERIC_PHRASES_DENY) {
      if (allText.includes(phrase)) {
        genericCount.set(phrase, (genericCount.get(phrase) ?? 0) + 1);
      }
    }
  }
  for (const [phrase, count] of genericCount) {
    if (count >= 2) {
      errors.push(`금지 범용 문구 ${count}회 반복: "${phrase}"`);
    }
  }

  return errors;
}

/**
 * 직접 주제 입력 → 2단계 Gemini 생성 (1단계: 건강정보 원문, 2단계: 카드 추출).
 */
export async function generateCardNewsFromTopic(params: {
  topic: string;
  targetAudience?: string;
  tone?: string;
  referenceText?: string;
  contentCardCount: number;
}): Promise<GeneratedDeckFromLlm> {
  const { topic, targetAudience, tone, referenceText, contentCardCount } = params;

  if (!isContentLlmEnabled()) {
    console.log("[ContentGenerator] LLM 비활성 — 주제 기반 rule fallback");
    return topicRuleFallback(topic, contentCardCount);
  }

  let validationHints: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const userPrompt = buildTopicGenerateUserPrompt({
        topic,
        targetAudience,
        tone,
        referenceText,
        contentCardCount,
        validationHints,
      });

      console.log(
        `[ContentGenerator] 주제 기반 2단계 생성 ${attempt}/${MAX_ATTEMPTS} ` +
          `(카드 ${contentCardCount}장, topic="${topic}", model=${resolveTextModel()})`
      );

      const rawText = await callGeminiDeckRewrite(
        userPrompt,
        TOPIC_GENERATE_SYSTEM_PROMPT,
        TOPIC_GENERATE_RESPONSE_SCHEMA
      );
      const parsed = parseJsonFromLlm(rawText);

      // sourceArticle 로깅 (풍부한 원문 생성 확인)
      const article = parsed.sourceArticle;
      if (article) {
        const sectionCount = article.sections?.length ?? 0;
        const bodyTotal = article.sections?.reduce((s, sec) => s + (sec.body?.length ?? 0), 0) ?? 0;
        console.log(
          `[ContentGenerator] sourceArticle 생성: "${article.title}" | ` +
            `${sectionCount}섹션, 총 ${bodyTotal}자`
        );
      } else {
        console.warn("[ContentGenerator] sourceArticle 없음 — 원문 생성이 누락됐을 수 있음");
      }

      const rawCards = parsed.cards ?? [];

      if (rawCards.length < contentCardCount) {
        throw new Error(
          `카드 수 부족: 요청 ${contentCardCount}장, 응답 ${rawCards.length}장`
        );
      }

      const contentCards: GeneratedCardCopy[] = [];
      for (let i = 0; i < contentCardCount; i++) {
        const cardIndex = i + 1;
        const match =
          rawCards.find((c) => c.cardIndex === cardIndex) ?? rawCards[i];
        contentCards.push(normalizeLlmDeckCard(match ?? {}, cardIndex, topic));
      }

      const coverImagePrompt = normalizeImagePrompt(
        parsed.coverImagePrompt,
        buildFallbackImagePrompt({ title: topic, topic, cardIndex: 0, isCover: true })
      );

      const coverResolved = resolveCoverTitle(
        parsed.rewrittenCoverTitle,
        parsed.coverTitleLines,
        topic
      );
      if (coverResolved.errors.length > 0) {
        console.warn(`[ContentGenerator] 표지 제목 검증 실패 → 폴백 적용`);
      }

      const deck: GeneratedDeckFromLlm = {
        coverTitle: coverResolved.title,
        coverTitleLines: coverResolved.lines,
        coverImagePrompt,
        contentCards,
      };

      // 비문 검사
      const hasBroken = contentCards.some(
        (r) =>
          isBrokenKorean(r.intro) ||
          isBrokenKorean(r.title) ||
          (r.highlights ?? []).some(isBrokenKorean) ||
          (r.outro ? isBrokenKorean(r.outro) : false)
      );

      // 중복·범용 문구 검사 (topic 전용)
      const uniqueErrors = validateTopicDeckUniqueness(contentCards);

      if (!hasBroken && uniqueErrors.length === 0) {
        console.log(`[ContentGenerator] 주제 기반 생성 통과 (시도 ${attempt})`);
        logImagePrompts(deck);
        return deck;
      }

      const retryReasons: string[] = [];
      if (hasBroken) {
        const { errors: structErrors } = validateCardNewsDeck(contentCards);
        retryReasons.push(...structErrors);
      }
      retryReasons.push(...uniqueErrors);

      validationHints = retryReasons.join("\n");
      console.warn(`[ContentGenerator] 재시도 필요:\n${validationHints}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ContentGenerator] 주제 기반 시도 ${attempt} 오류: ${msg}`);
      validationHints = msg;
    }
  }

  console.warn("[ContentGenerator] 주제 기반 Gemini 최종 실패 — rule fallback");
  return topicRuleFallback(topic, contentCardCount);
}

// ── 주제 기반 fallback 카드 템플릿 (각 카드가 서로 다른 내용) ─────────────────────

type TopicCardTemplate = {
  titleFn: (t: string) => string;
  subtitle: string;
  introFn: (t: string) => string;
  highlightsFn: (t: string) => string[];
  outroFn: (t: string) => string | undefined;
  imageKeyword: string;
};

const TOPIC_CARD_TEMPLATES: TopicCardTemplate[] = [
  {
    titleFn: () => "왜 중요할까요",
    subtitle: "문제 인식",
    introFn: (t) => `${t}은(는) 현대인 누구에게나 찾아올 수 있는 흔한 건강 이슈예요.`,
    highlightsFn: (t) => [`관련 증상을 일찍 인지할수록 생활 속 관리가 훨씬 수월해집니다.`],
    outroFn: () => "오늘부터 관심을 조금씩 기울여 보세요.",
    imageKeyword: "Korean adult looking thoughtful at home window morning light",
  },
  {
    titleFn: () => "주요 원인",
    subtitle: "왜 생기는 걸까?",
    introFn: (t) => `${t}은(는) 생활습관, 환경, 신체적 요인이 복합적으로 작용해 발생해요.`,
    highlightsFn: () => [
      `불규칙한 식사 시간과 수면 부족이 대표적인 원인 중 하나일 수 있어요.`,
    ],
    outroFn: () => "자신의 생활 패턴을 먼저 점검해 보는 것이 첫걸음이에요.",
    imageKeyword: "Korean adult checking phone late at night unhealthy habits lifestyle",
  },
  {
    titleFn: () => "이런 신호 주의",
    subtitle: "내 몸이 보내는 신호",
    introFn: (t) => `${t}과(와) 관련된 신체 신호를 평소에 체크해 두면 대처가 빨라져요.`,
    highlightsFn: () => [
      `증상이 2주 이상 지속되거나 점점 심해진다면 의료기관 방문을 고려하세요.`,
    ],
    outroFn: () => "몸이 보내는 신호를 가볍게 넘기지 마세요.",
    imageKeyword: "Korean person pressing hand on stomach discomfort mild pain home interior",
  },
  {
    titleFn: () => "실천 방법 1",
    subtitle: "바로 시작할 수 있어요",
    introFn: (t) => `${t}에 도움이 되는 가장 간단한 방법부터 일상에서 적용해 보세요.`,
    highlightsFn: () => [
      `하루 20~30분 가벼운 유산소 활동이 전반적인 컨디션 유지에 도움이 돼요.`,
    ],
    outroFn: () => "엘리베이터 대신 계단, 짧은 산책부터 시작해 보세요.",
    imageKeyword: "Korean adult walking in a park after meal gentle exercise lifestyle",
  },
  {
    titleFn: () => "실천 방법 2",
    subtitle: "식단과 수면 관리",
    introFn: (t) => `식습관과 수면 관리도 ${t} 예방에 중요한 역할을 해요.`,
    highlightsFn: () => [
      `가공식품을 줄이고 채소·단백질 중심 식사로 바꾸면 몸 상태 변화를 느낄 수 있어요.`,
    ],
    outroFn: () => "하루 7~8시간 수면을 목표로 일정한 기상 시간을 유지해 보세요.",
    imageKeyword: "Korean balanced meal vegetables soup on dining table warm natural light",
  },
  {
    titleFn: () => "이것은 피하세요",
    subtitle: "악화 요인 주의",
    introFn: (t) => `${t}을(를) 악화시킬 수 있는 습관에도 주의가 필요해요.`,
    highlightsFn: () => [
      `과도한 카페인 섭취, 음주, 흡연은 증상을 더 심하게 만들 수 있어요.`,
    ],
    outroFn: () => undefined,
    imageKeyword: "Korean adult refusing junk food unhealthy habits choosing healthy option",
  },
  {
    titleFn: () => "병원 방문 기준",
    subtitle: "전문가 상담 시기",
    introFn: (t) => `${t}이(가) 반복되거나 일상생활에 지장이 크다면 전문가 도움을 받아야 해요.`,
    highlightsFn: () => [
      `자가 진단보다 내과 또는 해당 전문과를 방문해 정확한 진단을 받는 것이 안전해요.`,
    ],
    outroFn: () => "조기 진단이 건강 회복의 가장 빠른 길이에요.",
    imageKeyword: "Korean patient talking with doctor at clinic warm professional setting",
  },
  {
    titleFn: () => "오늘의 한 가지",
    subtitle: "작은 실천이 먼저",
    introFn: (t) => `오늘부터 ${t}와(과) 관련해 딱 한 가지 실천을 시작해 보세요.`,
    highlightsFn: () => [
      `작은 변화를 꾸준히 기록하다 보면 어느 순간 건강한 습관이 자리를 잡아요.`,
    ],
    outroFn: () => "당신의 건강한 하루를 응원합니다.",
    imageKeyword: "Korean adult writing health diary journal morning table warm light",
  },
];

function topicRuleFallback(topic: string, contentCardCount: number): GeneratedDeckFromLlm {
  const templates = TOPIC_CARD_TEMPLATES.slice(0, contentCardCount);

  const contentCards: GeneratedCardCopy[] = templates.map((tmpl, i) => {
    const cardIndex = i + 1;
    const title = tmpl.titleFn(topic);
    return {
      index: cardIndex,
      title,
      subtitle: tmpl.subtitle,
      intro: tmpl.introFn(topic),
      highlights: tmpl.highlightsFn(topic),
      outro: tmpl.outroFn(topic),
      imagePrompt: [
        "High-quality realistic photography, warm lighting, lifestyle Korean/Asian mood.",
        tmpl.imageKeyword + ".",
        "Main subject on the left leaving empty center space.",
        "NO vector icons, NO clip-art, NO text/typography on image.",
      ].join(" "),
    };
  });

  const fb = buildFallbackCoverTitle(topic);
  return {
    coverTitle: fb.title,
    coverTitleLines: fb.lines,
    coverImagePrompt: buildFallbackImagePrompt({ title: topic, topic, cardIndex: 0, isCover: true }),
    contentCards,
  };
}

export function assertDeckCopyQuality(cards: ContentCard[]): boolean {
  let ok = true;
  for (const card of cards) {
    const fields: CardCopyFields = {
      title: card.title,
      intro: card.intro,
      highlights: card.highlights ?? card.bullets,
      outro: card.outro,
    };
    const errs = validateCardCopy(fields);
    if (errs.length > 0) {
      ok = false;
      console.warn(`[ContentGenerator] 카드 ${card.index} 품질 이슈: ${errs.join("; ")}`);
    }
    if (isBrokenKorean(card.intro) || isBrokenKorean(card.title)) {
      ok = false;
      console.warn(`[ContentGenerator] 카드 ${card.index} 비문 감지`);
    }
  }
  return ok;
}
