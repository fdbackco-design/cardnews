import type { CardNewsSet, ContentCard, CoverCard, KdcaContent } from "../types/cardnews";
import { slugify } from "../utils/fs";
import { truncate } from "../utils/text";

// ── 옵션 타입 ─────────────────────────────────────────────────────────────────

export type PlanCardNewsOptions = {
  topic: string;
  pattern: "narrative" | "list";
  source?: KdcaContent;
  contentId?: string;
  cardCount?: number;
};

// ── 상수 ─────────────────────────────────────────────────────────────────────

const MIN_CARDS = 6;
const MAX_CARDS = 8;
const MAX_INTRO_CHARS = 65;
const MAX_HIGHLIGHT_CHARS = 22;
const MAX_BULLET_CHARS = 24;
const MAX_TITLE_CHARS = 20;

// ── 내부 유틸리티 ─────────────────────────────────────────────────────────────

function clampCardCount(n: number | undefined): number {
  return Math.max(MIN_CARDS, Math.min(MAX_CARDS, n ?? MIN_CARDS));
}

function makeId(topic: string): string {
  return slugify(topic).slice(0, 30) || "card";
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
    variant: "bottom",
    label: "라이프 가이드",
    titleLines: splitCoverTitle(title),
    subtitle,
    imageQuery: imageQuery ?? `${title} health bright positive background`,
  };
}

// ── 소스 기반 카드 변환 ───────────────────────────────────────────────────────

function sectionsToNarrativeCards(
  sections: KdcaContent["sections"],
  maxCards: number,
  topic: string
): ContentCard[] {
  const roleLabels = ["개요", "주요 증상", "원인", "관리 방법", "주의 사항", "마무리"];

  return sections
    .filter((s) => s.body.trim().length >= 20)
    .slice(0, maxCards)
    .map((s, i) => {
      // heading이 있고 짧으면 그대로, 길면 role 라벨 사용
      const rawHeading = s.heading?.trim() ?? "";
      const title =
        rawHeading && rawHeading.length <= MAX_TITLE_CHARS
          ? rawHeading
          : roleLabels[i] ?? `핵심 ${i + 1}`;

      return {
        type: "content" as const,
        index: i + 1,
        title,
        intro: truncate(s.body, MAX_INTRO_CHARS),
        imageQuery: `${topic} health ${i % 2 === 0 ? "dark calm" : "bright clear"} background`,
      };
    });
}

function sectionsToListCards(
  sections: KdcaContent["sections"],
  maxCards: number,
  topic: string
): ContentCard[] {
  return sections
    .filter((s) => s.body.trim().length >= 20)
    .slice(0, maxCards)
    .map((s, i) => {
      const sentences = s.body
        .split(/[.。]\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 8)
        .slice(0, 3)
        .map((t) => truncate(t, MAX_BULLET_CHARS));

      return {
        type: "content" as const,
        index: i + 1,
        title: truncate(s.heading ?? `방법 ${i + 1}`, MAX_TITLE_CHARS),
        subtitle: `${i + 1}번째 포인트`,
        intro: truncate(s.body, MAX_INTRO_CHARS),
        bullets: sentences.length > 0 ? sentences : undefined,
        imageQuery: `${topic} health tip ${i + 1} dark calm background`,
      };
    });
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
      variant: "bottom",
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

function buildNarrativeFromSource(
  options: PlanCardNewsOptions,
  source: KdcaContent
): CardNewsSet {
  const { topic, cardCount } = options;
  const count = clampCardCount(cardCount);
  const cards = sectionsToNarrativeCards(source.sections, count - 1, topic);

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

  return {
    id: makeId(source.title || topic),
    title: source.title || topic,
    topic,
    pattern: "narrative",
    sourceUrl: source.sourceUrl,
    cover: makeCover(
      source.title || topic,
      undefined,
      `${topic} health bright positive background`
    ),
    cards,
  };
}

function buildListFromSource(
  options: PlanCardNewsOptions,
  source: KdcaContent
): CardNewsSet {
  const { topic, cardCount } = options;
  const count = clampCardCount(cardCount);
  const cards = sectionsToListCards(source.sections, count - 1, topic);

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

  return {
    id: makeId(source.title || topic),
    title: source.title || topic,
    topic,
    pattern: "list",
    sourceUrl: source.sourceUrl,
    cover: makeCover(source.title || topic),
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

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 입력 옵션으로부터 CardNewsSet을 생성합니다.
 *
 * 우선순위:
 *   1. 토픽 전용 프리셋 (narrative 한정)
 *   2. KdcaContent 기반 변환 (source.sections >= 3개)
 *   3. 범용 템플릿
 */
export function planCardNews(options: PlanCardNewsOptions): CardNewsSet {
  const { pattern, topic, source, cardCount } = options;
  const count = clampCardCount(cardCount);
  const resolved = { ...options, cardCount: count };

  if (pattern === "narrative") {
    const topicBuilder = matchTopicBuilder(topic, NARRATIVE_TOPIC_BUILDERS);
    if (topicBuilder) return topicBuilder(resolved);

    if (source && source.sections.length >= 3) {
      return buildNarrativeFromSource(resolved, source);
    }

    return buildGenericNarrative(resolved);
  }

  // list pattern
  if (source && source.sections.length >= 3) {
    return buildListFromSource(resolved, source);
  }
  return buildGenericList(resolved);
}

/** 이미 구성된 CardNewsSet을 그대로 반환 (테스트/디버그용) */
export function planFromPreset(preset: CardNewsSet): CardNewsSet {
  return preset;
}
