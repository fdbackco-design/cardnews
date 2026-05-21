/**
 * 표지 제목(rewrittenCoverTitle) 검증 + rule-based 폴백.
 *
 * Gemini가 재작성한 제목이 너무 길거나 원문과 동일하거나, 호출 자체가 실패했을 때
 * 원문 KDCA 제목으로부터 짧고 자연스러운 카드뉴스용 제목을 만들어낸다.
 */

import { isBrokenKorean } from "./cardCopyValidator";

export const COVER_TITLE_LIMITS = {
  /** 너무 짧으면 정보성 부족 */
  min: 6,
  /** 권장 상한 (광고/낚시 톤 회피) */
  recommendedMax: 22,
  /** 허용 grace — 검증 실패 처리 임계점 */
  hardMax: 28,
  /** 한 줄당 권장 최대 길이 */
  perLineMax: 16,
  /** 줄 수 최대 */
  linesMax: 3,
} as const;

/** 광고성·낚시성·의학적 단정 표현 — 적발 시 재작성 요청 */
const HYPE_PATTERNS: RegExp[] = [
  /충격|경악|소름/,
  /(절대|반드시|100\s*%)\s*(낫|예방|완치|효과)/,
  /비밀|마법|기적/,
  /바로\s*(낫|완치)/,
  /확실하게\s*(낫|예방|완치)/,
];

const TRAILING_PARTICLES = /\s*(및|으로|에서|의|에|와|과|을|를|이|가)\s*$/;

/** 입력 문자열의 시각적(공백 포함) 길이 */
function visualLength(s: string): number {
  return s.trim().length;
}

/** 표지 제목 1줄 검증 */
export function validateCoverTitle(
  title: string,
  originalTitle: string | undefined
): string[] {
  const errors: string[] = [];
  const t = title.trim();

  if (!t) {
    errors.push("rewrittenCoverTitle: 비어 있음");
    return errors;
  }
  const len = visualLength(t);
  if (len < COVER_TITLE_LIMITS.min) {
    errors.push(`rewrittenCoverTitle: 너무 짧음(${len}자) — "${t}"`);
  }
  if (len > COVER_TITLE_LIMITS.hardMax) {
    errors.push(
      `rewrittenCoverTitle: 길이 초과(${len}자, 권장 ${COVER_TITLE_LIMITS.recommendedMax}자 내외) — "${t}"`
    );
  }
  if (isBrokenKorean(t)) {
    errors.push(`rewrittenCoverTitle: 비문 — "${t}"`);
  }
  if (/[(\[（]/.test(t) && !/[)\]）]/.test(t)) {
    errors.push("rewrittenCoverTitle: 괄호 미완성");
  }
  if (TRAILING_PARTICLES.test(t)) {
    errors.push(`rewrittenCoverTitle: 조사로 끝남 — "${t}"`);
  }
  if (HYPE_PATTERNS.some((re) => re.test(t))) {
    errors.push(`rewrittenCoverTitle: 광고성·의학적 단정 표현 사용 — "${t}"`);
  }
  if (originalTitle && t === originalTitle.trim()) {
    errors.push("rewrittenCoverTitle: 원문 제목과 동일 — 재작성 필요");
  }

  return errors;
}

/** 표지 제목 줄 분리 검증 */
export function validateCoverTitleLines(lines: string[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push("coverTitleLines: 비어 있음");
    return errors;
  }
  if (lines.length > COVER_TITLE_LIMITS.linesMax) {
    errors.push(
      `coverTitleLines: 줄 수 초과(${lines.length}) — 1~${COVER_TITLE_LIMITS.linesMax}줄`
    );
  }
  lines.forEach((l, i) => {
    const t = String(l ?? "").trim();
    if (!t) {
      errors.push(`coverTitleLines[${i}]: 빈 줄`);
      return;
    }
    if (t.length > COVER_TITLE_LIMITS.perLineMax + 4) {
      errors.push(
        `coverTitleLines[${i}]: 한 줄 길이 초과(${t.length}자, 권장 ${COVER_TITLE_LIMITS.perLineMax}자) — "${t}"`
      );
    }
    if (TRAILING_PARTICLES.test(t)) {
      errors.push(`coverTitleLines[${i}]: 조사로 끝남 — "${t}"`);
    }
  });
  return errors;
}

/** 표지 제목 한 문자열을 2줄로 자연스럽게 분리 */
export function splitCoverTitleToLines(title: string): string[] {
  const t = title.trim();
  if (!t) return [];
  if (t.length <= 10) return [t];

  const mid = Math.round(t.length / 2);
  let best = -1;
  for (let i = 0; i < t.length; i++) {
    if (/\s/.test(t[i] ?? "")) {
      if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i;
    }
  }

  if (best > 0 && best < t.length - 1) {
    const head = t.slice(0, best).trim();
    const tail = t.slice(best + 1).trim();
    if (head && tail) return [head, tail];
  }

  return [t.slice(0, mid), t.slice(mid)];
}

/**
 * rule-based 폴백 — Gemini 실패 시 원문 제목에서 짧은 표지 제목 생성.
 *
 * 전략:
 *   1. 끝의 ! ? . … "~하세요" 등을 정리
 *   2. ":" / "," 로 분리해 의미있는 segment 추출 (보통 헤드 또는 두 번째)
 *   3. 22자 이내가 되도록 어절 경계에서 자르기
 *   4. 2줄로 분리
 */
export function buildFallbackCoverTitle(
  originalTitle: string
): { title: string; lines: string[] } {
  let t = originalTitle
    .trim()
    .replace(/[!?.…]+$/g, "")
    .replace(/(완성|관리|확인)?하세요\s*[!?.…]*$/g, "")
    .replace(/첫걸음\s*$/g, "")
    .trim();

  const parts = t
    .split(/[:：,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const head = parts[0]!;
    if (head.length >= 6 && head.length <= COVER_TITLE_LIMITS.recommendedMax) {
      t = head;
    } else if (head.length < 6 && parts[1]) {
      const combined = `${head}, ${parts[1]}`;
      t =
        combined.length <= COVER_TITLE_LIMITS.recommendedMax + 4
          ? combined
          : parts[1]!;
    } else {
      t = head;
    }
  }

  if (t.length > COVER_TITLE_LIMITS.recommendedMax) {
    const cut = t.slice(0, COVER_TITLE_LIMITS.recommendedMax);
    const lastSpace = cut.lastIndexOf(" ");
    t = (lastSpace > 6 ? cut.slice(0, lastSpace) : cut)
      .replace(/[(\[（,，、\s]+$/g, "")
      .replace(TRAILING_PARTICLES, "")
      .trim();
  }

  if (!t || t.length < COVER_TITLE_LIMITS.min) {
    t = originalTitle.trim().slice(0, COVER_TITLE_LIMITS.recommendedMax);
  }

  return { title: t, lines: splitCoverTitleToLines(t) };
}
