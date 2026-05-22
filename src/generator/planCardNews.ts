import type { CardNewsSet, ContentCard, CoverCard, KdcaContent } from "../types/cardnews";
import { slugify } from "../utils/fs";
import {
  generateCardNewsFromSource,
  generateCardNewsFromTopic,
  isContentLlmEnabled,
  logCardCopyValidation,
  toContentCard,
} from "../services/content/contentGenerator";
import { buildVisualImageQuery } from "../utils/text";

// ── 옵션 타입 ─────────────────────────────────────────────────────────────────

export type PlanCardNewsOptions = {
  topic: string;
  pattern: "narrative" | "list";
  source?: KdcaContent;
  contentId?: string;
  cardCount?: number;
  // 직접 주제 입력 모드 전용
  targetAudience?: string;
  tone?: string;
  referenceText?: string;
};

// ── 상수 ─────────────────────────────────────────────────────────────────────

const MIN_CARDS = 6;
const MAX_CARDS = 8;
const MIN_KDCA_SECTIONS = 2;

// ── 내부 유틸리티 ─────────────────────────────────────────────────────────────

function clampCardCount(n: number | undefined): number {
  return Math.max(MIN_CARDS, Math.min(MAX_CARDS, n ?? MIN_CARDS));
}

function makeId(topic: string): string {
  return slugify(topic).slice(0, 30) || "card";
}

/** 공백·구두점 제거 후 글자 수 홀/짝으로 cover-top / cover-bottom을 안정적으로 선택 */
function pickCoverVariant(topic: string): "top" | "bottom" {
  const clean = topic.replace(/[\s,，、.。!！?？:：]/g, "");
  return clean.length % 2 === 0 ? "top" : "bottom";
}

function splitCoverTitle(title: string): string[] {
  // 쉼표/마침표 기준 자연 분리
  const byComma = title.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  if (byComma.length >= 2) return byComma;

  // 길이 기반 분리
  const len = title.length;
  if (len <= 7) return [title];
  if (len <= 13) {
    const mid = Math.round(len / 2);
    return [title.slice(0, mid), title.slice(mid)];
  }
  const third = Math.floor(len / 3);
  return [title.slice(0, third), title.slice(third, third * 2), title.slice(third * 2)];
}

function makeCover(
  title: string,
  subtitle?: string,
  imageQuery?: string
): CoverCard {
  return {
    type: "cover",
    variant: pickCoverVariant(title),
    label: "라이프 가이드",
    titleLines: splitCoverTitle(title),
    subtitle,
    imageQuery: imageQuery ?? `${title} health bright positive background`,
  };
}

/** Gemini가 재작성한 표지 제목·라인을 그대로 적용 (KDCA 원문은 별도로 보존) */
function makeCoverFromRewritten(params: {
  rewrittenTitle: string;
  titleLines: string[];
  fallbackImageTopic: string;
  subtitle?: string;
  imageQuery?: string;
}): CoverCard {
  const { rewrittenTitle, titleLines, fallbackImageTopic, subtitle, imageQuery } =
    params;
  return {
    type: "cover",
    variant: pickCoverVariant(rewrittenTitle),
    label: "라이프 가이드",
    titleLines: titleLines.length > 0 ? titleLines : splitCoverTitle(rewrittenTitle),
    rewrittenCoverTitle: rewrittenTitle,
    subtitle,
    imageQuery:
      imageQuery ?? `${fallbackImageTopic} health bright positive background`,
  };
}

// ── KDCA 섹션 → 카드 필드 ─────────────────────────────────────────────────────

type KdcaSection = KdcaContent["sections"][number];

function isUsableSection(s: KdcaSection): boolean {
  const body = s.body.trim();
  return body.length >= 20 || (Boolean(s.heading?.trim()) && body.length >= 5);
}

function sectionPriorityScore(heading: string): number {
  const h = heading.toLowerCase();
  if (/이란|개요|정의/.test(h)) return 100;
  if (/주요\s*증상|증상/.test(h)) return 90;
  if (/원인/.test(h)) return 85;
  if (/자가\s*진단|체크/.test(h)) return 80;
  if (/관리|실천/.test(h)) return 75;
  if (/병원|방문|주의/.test(h)) return 70;
  if (/질문|faq/.test(h)) return 40;
  return 50;
}

/** 카드뉴스 내용 카드 수(5~6)에 맞게 섹션 선택 (우선순위 정렬) */
function selectSectionsForCards(
  sections: KdcaContent["sections"],
  maxContentCards: number
): KdcaSection[] {
  let usable = sections.filter(isUsableSection);

  const withHeading = usable.filter((s) => Boolean(s.heading?.trim()));
  if (withHeading.length >= MIN_KDCA_SECTIONS) {
    usable = withHeading;
  }

  const indexed = usable.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => {
    const scoreDiff =
      sectionPriorityScore(b.s.heading ?? "") - sectionPriorityScore(a.s.heading ?? "");
    if (scoreDiff !== 0) return scoreDiff;
    return a.i - b.i;
  });

  const sorted = indexed.map((x) => x.s);
  if (sorted.length <= maxContentCards) return sorted;
  return sorted.slice(0, maxContentCards);
}

/** Gemini HTML 재작성 → ContentCard + 표지 제목·imagePrompt */
async function buildContentCardsFromSource(
  source: KdcaContent,
  maxCards: number,
  topic: string,
  pattern: "narrative" | "list"
): Promise<{
  cards: ContentCard[];
  coverTitle: string;
  coverTitleLines: string[];
  coverImagePrompt: string;
}> {
  const deck = await generateCardNewsFromSource({
    source,
    topic,
    contentCardCount: maxCards,
  });
  logCardCopyValidation(deck.contentCards);

  const cards = deck.contentCards.map((copy, i) => {
    const section = source.sections[i];
    const bodyForImage = section?.body ?? source.rawText.slice(0, 600);
    return toContentCard(copy, i, topic, pattern, bodyForImage);
  });

  return {
    cards,
    coverTitle: deck.coverTitle,
    coverTitleLines: deck.coverTitleLines,
    coverImagePrompt: deck.coverImagePrompt,
  };
}

// ── 혈압 주제 전용 프리셋 (narrative) ─────────────────────────────────────────

function buildBloodPressureNarrative(options: PlanCardNewsOptions): CardNewsSet {
  const { contentId } = options;
  const sourceUrl = contentId
    ? `https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsView.do?thtimt_cntnts_sn=${contentId}`
    : undefined;

  return {
    id: "blood-pressure-basics",
    title: "혈압 수치, 제대로 읽고 있을까?",
    topic: "혈압",
    pattern: "narrative",
    sourceUrl,
    cover: {
      type: "cover",
      variant: pickCoverVariant("혈압 수치, 제대로 읽고 있을까?"),
      label: "라이프 가이드",
      titleLines: ["혈압 수치,", "제대로", "읽고 있을까?"],
      subtitle: "내 혈압 숫자가 말하는 것",
      imageQuery: "senior man blood pressure cuff arm home health check photo portrait",
    },
    cards: [
      {
        type: "content",
        index: 1,
        title: "혈압 숫자의 의미",
        subtitle: "두 숫자, 각각 무엇을 나타낼까요?",
        intro: "혈압은 위·아래 두 숫자로 표현돼요. 각각 심장의 두 단계를 반영합니다.",
        highlights: [
          "위 숫자 → 수축기 혈압",
          "아래 숫자 → 이완기 혈압",
        ],
        outro: "어느 한쪽만 높아도 주의가 필요해요.",
        imageQuery: "man arm blood pressure cuff reading home dark moody photo",
      },
      {
        type: "content",
        index: 2,
        title: "수축기 혈압",
        subtitle: "심장이 수축할 때 혈관에 가해지는 압력",
        intro: "심장이 수축할 때 혈관에 가해지는 압력이에요. 120mmHg 미만이 정상이에요.",
        highlights: [
          "정상: 120mmHg 미만",
          "주의: 120~129mmHg",
          "고혈압 범위: 130mmHg 이상",
        ],
        outro: "한 번보다 일정 기간의 평균을 확인하세요.",
        imageQuery: "blood pressure monitor digital screen dark table photo",
      },
      {
        type: "content",
        index: 3,
        title: "이완기 혈압",
        subtitle: "심장이 쉬는 동안 혈관이 받는 압력",
        intro: "심장이 쉬는 동안 혈관이 받는 압력이에요. 80mmHg 미만이 정상이에요.",
        highlights: [
          "정상: 80mmHg 미만",
          "주의: 80~89mmHg",
          "고혈압 범위: 90mmHg 이상",
        ],
        outro: "너무 낮아도 증상이 생길 수 있어요. 두 수치를 함께 봐야 해요.",
        imageQuery: "woman calm breathing eyes closed indoor dark warm light photo",
      },
      {
        type: "content",
        index: 4,
        title: "혈압은 한 번보다 흐름",
        subtitle: "매일의 기록이 더 의미 있습니다",
        intro: "혈압은 식사·스트레스 등에 따라 수시로 변해요. 한 번 측정으로는 부족해요.",
        highlights: [
          "아침 기상 후 1시간 이내",
          "저녁 잠들기 전",
          "1~2주간 꾸준히 기록",
        ],
        outro: "가정 혈압 기록을 지참하면 상담에 도움이 돼요.",
        imageQuery: "health journal notebook pen table morning warm dark photo",
      },
      {
        type: "content",
        index: 5,
        title: "생활습관 관리",
        subtitle: "혈압에 영향을 주는 일상의 선택들",
        intro: "혈압은 생활습관과 밀접하게 연결돼 있어요.",
        bullets: [
          "유산소 운동 주 150분 이상",
          "나트륨 하루 2,000mg 이하",
          "금연 및 절주",
          "충분한 수면·스트레스 관리",
        ],
        outro: "정기 검진으로 혈압을 주기적으로 확인하세요.",
        imageQuery: "woman walking park outdoor morning exercise healthy lifestyle photo",
      },
    ],
  };
}

// ── 소스 기반 범용 빌더 ───────────────────────────────────────────────────────

async function buildNarrativeFromSource(
  options: PlanCardNewsOptions,
  source: KdcaContent
): Promise<CardNewsSet> {
  const { topic, cardCount } = options;
  const count = clampCardCount(cardCount);
  const { cards, coverTitle, coverTitleLines, coverImagePrompt } =
    await buildContentCardsFromSource(source, count - 1, topic, "narrative");

  // 섹션 수가 부족하면 마지막 카드를 생활 관리 카드로 보완
  while (cards.length < count - 1) {
    const i = cards.length;
    cards.push({
      type: "content",
      index: i + 1,
      title: i === count - 2 ? "생활 속 관리" : `핵심 ${i + 1}`,
      intro:
        i === count - 2
          ? `${topic}와 관련된 생활 속 관리 방법을 꾸준히 실천해 보세요.`
          : `${topic}에 대한 중요한 정보를 확인해 보세요.`,
      imageQuery: `${topic} health lifestyle management ${i % 2 === 0 ? "dark" : "bright"}`,
    });
  }

  const originalTitle = source.title || topic;
  return {
    id: makeId(originalTitle),
    title: originalTitle,
    originalTitle,
    topic,
    pattern: "narrative",
    sourceUrl: source.sourceUrl,
    cover: makeCoverFromRewritten({
      rewrittenTitle: coverTitle,
      titleLines: coverTitleLines,
      fallbackImageTopic: topic,
      imageQuery: coverImagePrompt,
    }),
    cards,
  };
}

async function buildListFromSource(
  options: PlanCardNewsOptions,
  source: KdcaContent
): Promise<CardNewsSet> {
  const { topic, cardCount } = options;
  const count = clampCardCount(cardCount);
  const { cards, coverTitle, coverTitleLines, coverImagePrompt } =
    await buildContentCardsFromSource(source, count - 1, topic, "list");

  while (cards.length < count - 1) {
    const i = cards.length;
    cards.push({
      type: "content",
      index: i + 1,
      title: `방법 ${i + 1}`,
      subtitle: `${i + 1}번째 포인트`,
      intro: `${topic}와 관련된 실천 방법을 확인해 보세요.`,
      imageQuery: `${topic} health tip ${i + 1} dark calm background`,
    });
  }

  const originalTitle = source.title || topic;
  return {
    id: makeId(originalTitle),
    title: originalTitle,
    originalTitle,
    topic,
    pattern: "list",
    sourceUrl: source.sourceUrl,
    cover: makeCoverFromRewritten({
      rewrittenTitle: coverTitle,
      titleLines: coverTitleLines,
      fallbackImageTopic: topic,
      imageQuery: coverImagePrompt,
    }),
    cards,
  };
}

// ── 범용 템플릿 빌더 (source 없을 때) ────────────────────────────────────────

function buildGenericNarrative(options: PlanCardNewsOptions): CardNewsSet {
  const { topic, cardCount } = options;
  const count = clampCardCount(cardCount);
  const roles = ["문제 인식", "핵심 개념", "주요 정보", "주의 사항", "생활 속 관리", "마무리"];

  const cards: ContentCard[] = Array.from({ length: count - 1 }, (_, i) => ({
    type: "content" as const,
    index: i + 1,
    title: roles[i] ?? `핵심 ${i + 1}`,
    intro:
      i === 0
        ? `${topic}에 대해 알아두면 도움이 되는 내용을 함께 살펴봐요.`
        : `${topic}와 관련된 중요한 정보를 안내해 드립니다.`,
    imageQuery: `${topic} health ${i % 2 === 0 ? "dark calm" : "bright"} background`,
  }));

  return {
    id: makeId(topic),
    title: topic,
    topic,
    pattern: "narrative",
    cover: makeCover(topic),
    cards,
  };
}

function buildGenericList(options: PlanCardNewsOptions): CardNewsSet {
  const { topic, cardCount } = options;
  const count = clampCardCount(cardCount);

  const cards: ContentCard[] = Array.from({ length: count - 1 }, (_, i) => ({
    type: "content" as const,
    index: i + 1,
    title: `방법 ${i + 1}`,
    subtitle: `${topic} 핵심 포인트 ${i + 1}`,
    intro: `${topic}와 관련된 실천 방법 ${i + 1}번입니다.`,
    bullets: ["관련 내용을 확인해 주세요."],
    imageQuery: `${topic} health tip ${i + 1} dark calm background`,
  }));

  return {
    id: makeId(topic),
    title: topic,
    topic,
    pattern: "list",
    cover: makeCover(topic),
    cards,
  };
}

// ── 직접 주제 기반 빌더 (LLM 창작) ───────────────────────────────────────────

async function buildNarrativeFromTopic(
  options: PlanCardNewsOptions
): Promise<CardNewsSet> {
  const { topic, cardCount, targetAudience, tone, referenceText } = options;
  const count = clampCardCount(cardCount);
  const contentCardCount = count - 1;

  const deck = await generateCardNewsFromTopic({
    topic,
    targetAudience,
    tone,
    referenceText,
    contentCardCount,
  });
  logCardCopyValidation(deck.contentCards);

  const cards: ContentCard[] = deck.contentCards.map((copy, i) =>
    toContentCard(copy, i, topic, "narrative", "")
  );

  while (cards.length < contentCardCount) {
    const i = cards.length;
    const isLast = i === contentCardCount - 1;
    cards.push({
      type: "content",
      index: i + 1,
      title: isLast ? "오늘부터 시작" : "추가 정보",
      intro: isLast
        ? "오늘 하나만 골라 시작해 보세요. 일주일 후 변화를 확인해 봅니다."
        : "참고 내용에 담긴 항목을 살펴보고 자신에게 맞는 방법을 골라 보세요.",
      imageQuery: `Korean adult ${isLast ? "writing health journal at desk" : "reading health note at home"} natural light lifestyle`,
    });
  }

  return {
    id: makeId(topic),
    title: deck.coverTitle,
    originalTitle: topic,
    topic,
    pattern: "narrative",
    cover: makeCoverFromRewritten({
      rewrittenTitle: deck.coverTitle,
      titleLines: deck.coverTitleLines,
      fallbackImageTopic: topic,
      imageQuery: deck.coverImagePrompt,
    }),
    cards,
  };
}

// ── 토픽 매핑 ─────────────────────────────────────────────────────────────────

type TopicBuilder = (options: PlanCardNewsOptions) => CardNewsSet;

// 토픽 키워드 → 전용 빌더 (keyword가 topic에 포함되면 매칭)
const NARRATIVE_TOPIC_BUILDERS: Record<string, TopicBuilder> = {
  혈압: buildBloodPressureNarrative,
};

function matchTopicBuilder(
  topic: string,
  map: Record<string, TopicBuilder>
): TopicBuilder | undefined {
  const key = Object.keys(map).find((k) => topic.includes(k));
  return key ? map[key] : undefined;
}

/** KDCA 원문을 카드 기획에 쓸 수 있는지 (최소 2개 유효 섹션) */
function hasUsableKdcaSource(source: KdcaContent): boolean {
  return source.sections.filter(isUsableSection).length >= MIN_KDCA_SECTIONS;
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 입력 옵션으로부터 CardNewsSet을 생성합니다.
 *
 * 우선순위:
 *   1. KdcaContent 기반 변환 (수집된 원문이 있으면 토픽 키워드보다 우선)
 *   2. 토픽 전용 프리셋 (narrative, 원문 없을 때만)
 *   3. 범용 템플릿
 */
export function planCardNews(options: PlanCardNewsOptions): CardNewsSet {
  const { pattern, topic, source, cardCount } = options;
  const count = clampCardCount(cardCount);
  const resolved = { ...options, cardCount: count };

  if (pattern === "narrative") {
    const topicBuilder = matchTopicBuilder(topic, NARRATIVE_TOPIC_BUILDERS);
    if (topicBuilder && !(source && hasUsableKdcaSource(source))) {
      return topicBuilder(resolved);
    }
    if (source && hasUsableKdcaSource(source)) {
      throw new Error(
        "KDCA 원문 기획은 planCardNewsAsync()를 사용하세요. (LLM 카피 재작성)"
      );
    }
    return buildGenericNarrative(resolved);
  }

  if (source && hasUsableKdcaSource(source)) {
    throw new Error(
      "KDCA 원문 기획은 planCardNewsAsync()를 사용하세요. (LLM 카피 재작성)"
    );
  }
  return buildGenericList(resolved);
}

/**
 * KDCA 원문이 있으면 LLM으로 카드 카피를 재작성한다.
 */
export async function planCardNewsAsync(
  options: PlanCardNewsOptions
): Promise<CardNewsSet> {
  const { pattern, topic, source, cardCount } = options;
  const count = clampCardCount(cardCount);
  const resolved = { ...options, cardCount: count };

  if (pattern === "narrative") {
    if (source && hasUsableKdcaSource(source)) {
      return buildNarrativeFromSource(resolved, source);
    }
    const topicBuilder = matchTopicBuilder(topic, NARRATIVE_TOPIC_BUILDERS);
    if (topicBuilder) return topicBuilder(resolved);
    // 직접 주제 입력: LLM으로 창작
    if (isContentLlmEnabled()) {
      return buildNarrativeFromTopic(resolved);
    }
    return buildGenericNarrative(resolved);
  }

  if (source && hasUsableKdcaSource(source)) {
    return buildListFromSource(resolved, source);
  }
  // 직접 주제 입력 list 패턴: LLM 창작
  if (isContentLlmEnabled()) {
    return buildNarrativeFromTopic({ ...resolved, pattern: "narrative" });
  }
  return buildGenericList(resolved);
}

/** 이미 구성된 CardNewsSet을 그대로 반환 (테스트/디버그용) */
export function planFromPreset(preset: CardNewsSet): CardNewsSet {
  return preset;
}
