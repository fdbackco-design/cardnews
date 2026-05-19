import { planCardNews } from "../generator/planCardNews";
import type { CardNewsSet } from "../types/cardnews";

/**
 * 혈압 주제 샘플 카드뉴스.
 * planCardNews를 통해 생성되므로 실제 출력물과 구조가 동일합니다.
 */
export const sampleBloodPressure: CardNewsSet = planCardNews({
  topic: "혈압 수치, 제대로 읽고 있을까?",
  pattern: "narrative",
  contentId: "137",
  cardCount: 6,
});

/**
 * 주제 키워드로 샘플을 조회합니다. 없으면 undefined.
 */
const SAMPLES: Record<string, CardNewsSet> = {
  혈압: sampleBloodPressure,
};

export function getSampleByTopic(topic: string): CardNewsSet | undefined {
  const key = Object.keys(SAMPLES).find((k) => topic.includes(k));
  return key ? SAMPLES[key] : undefined;
}
