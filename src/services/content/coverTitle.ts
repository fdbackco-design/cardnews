/**
 * 표지 제목(rewrittenCoverTitle) 검증 + rule-based 폴백.
 *
 * 규칙: 반드시 2줄, 각 줄 공백 포함 10자 이내.
 */

import { isBrokenKorean } from "./cardCopyValidator";

export const COVER_TITLE_LIMITS = {
  min: 4,
  /** 총 길이 참고값 (2줄 × 10자 + 공백) */
  recommendedMax: 20,
  hardMax: 22,
  /** 한 줄당 최대 글자 수 (공백 포함) */
  perLineMax: 10,
  /** 정확히 2줄 */
  linesRequired: 2,
  linesMax: 2,
} as const;

/** 광고성·낚시성·의학적 단정 표현 */
const HYPE_PATTERNS: RegExp[] = [
  /충격|경악|소름/,
  /(절대|반드시|100\s*%)\s*(낫|예방|완치|효과)/,
  /비밀|마법|기적/,
  /바로\s*(낫|완치)/,
  /확실하게\s*(낫|예방|완치)/,
];

const TRAILING_PARTICLES = /\s*(및|으로|에서|의|에|와|과|을|를|이|가)\s*$/;

function visualLength(s: string): number {
  return s.trim().length;
}

/** 표지 제목 1줄(전체 string) 검증 */
export function validateCoverTitle(title: string, originalTitle: string | undefined): string[] {
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
      `rewrittenCoverTitle: 길이 초과(${len}자, 최대 ${COVER_TITLE_LIMITS.hardMax}자) — "${t}"`
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

/** 표지 줄 배열 검증 — 정확히 2줄, 각 줄 10자 이내 */
export function validateCoverTitleLines(lines: string[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push("coverTitleLines: 비어 있음");
    return errors;
  }
  if (lines.length !== COVER_TITLE_LIMITS.linesRequired) {
    errors.push(
      `coverTitleLines: 정확히 ${COVER_TITLE_LIMITS.linesRequired}줄 필요 (현재 ${lines.length}줄)`
    );
  }
  lines.forEach((l, i) => {
    const t = String(l ?? "").trim();
    if (!t) {
      errors.push(`coverTitleLines[${i}]: 빈 줄`);
      return;
    }
    if (t.length > COVER_TITLE_LIMITS.perLineMax) {
      errors.push(
        `coverTitleLines[${i}]: 한 줄 ${COVER_TITLE_LIMITS.perLineMax}자 초과(${t.length}자) — "${t}"`
      );
    }
    if (TRAILING_PARTICLES.test(t)) {
      errors.push(`coverTitleLines[${i}]: 조사로 끝남 — "${t}"`);
    }
  });
  return errors;
}

/**
 * 표지 제목을 반드시 2줄로 분리.
 * 각 줄 10자 이내를 목표로 어절 경계에서 끊는다.
 */
export function splitCoverTitleToLines(title: string): string[] {
  const t = title.trim();
  if (!t) return ["", ""];

  const MAX = COVER_TITLE_LIMITS.perLineMax;
  const words = t.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    const w = words[0]!;
    const mid = Math.ceil(w.length / 2);
    return [w.slice(0, mid), w.slice(mid)];
  }

  // 어절 경계에서 line1에 최대한 채우되 MAX 초과 않기
  let line1 = words[0]!;
  let splitIdx = 1;
  for (let i = 1; i < words.length; i++) {
    const candidate = `${line1} ${words[i]}`;
    if (candidate.length <= MAX) {
      line1 = candidate;
      splitIdx = i + 1;
    } else {
      break;
    }
  }

  // line2: 나머지 어절을 MAX 이내로
  let line2 = words.slice(splitIdx).join(" ");
  if (line2.length > MAX) {
    const w2 = line2.split(/\s+/);
    let l2 = "";
    for (const w of w2) {
      const candidate = l2 ? `${l2} ${w}` : w;
      if (candidate.length <= MAX) l2 = candidate;
      else break;
    }
    line2 = l2 || line2.slice(0, MAX);
  }

  // line2가 비어 있으면 line1의 마지막 어절을 옮김
  if (!line2) {
    const lastSpace = line1.lastIndexOf(" ");
    if (lastSpace > 0) {
      line2 = line1.slice(lastSpace + 1);
      line1 = line1.slice(0, lastSpace);
    } else {
      const mid = Math.ceil(line1.length / 2);
      line2 = line1.slice(mid);
      line1 = line1.slice(0, mid);
    }
  }

  return [line1, line2];
}

/**
 * 텍스트에서 MAX 이내의 짧은 어절 구절을 추출.
 * 조사로 끝나는 경우 마지막 조사를 제거한다.
 */
function getShortPhrase(text: string, max: number): string {
  const PARTICLE_END = /\s*(및|으로|에서|의|에|와|과|을|를)\s*$/;
  const words = text.trim().split(/\s+/).filter(Boolean);
  let phrase = "";
  for (const w of words) {
    const candidate = phrase ? `${phrase} ${w}` : w;
    if (candidate.length > max) break;
    phrase = candidate;
  }
  return phrase.replace(PARTICLE_END, "").trim();
}

/**
 * rule-based 폴백 — Gemini 실패 시 원문 제목에서 2줄(각 ≤10자) 생성.
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

  const MAX = COVER_TITLE_LIMITS.perLineMax;

  // 자연 구분자로 분리
  const segments = t
    .split(/[:：,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 두 세그먼트 모두 MAX 이내이면 바로 2줄
  const shortSegs = segments.filter((s) => s.length <= MAX);
  if (shortSegs.length >= 2) {
    return { title: `${shortSegs[0]} ${shortSegs[1]}`, lines: [shortSegs[0]!, shortSegs[1]!] };
  }

  // 짧은 세그먼트가 1개면 → line1로 쓰고, 나머지 텍스트에서 line2 추출
  if (shortSegs.length === 1) {
    const line1 = shortSegs[0]!;
    const rest = segments.filter((s) => s !== line1).join(" ");
    if (rest) {
      const line2 = getShortPhrase(rest, MAX);
      if (line2.length >= 2) {
        return { title: `${line1} ${line2}`, lines: [line1, line2] };
      }
    }
  }

  // 모든 세그먼트가 길거나 구분자가 없는 경우 — 어절 경계 분리
  const base = segments[0] ?? t;
  const lines = splitCoverTitleToLines(base);
  const l1 = (lines[0] ?? "").slice(0, MAX);
  const l2 = (lines[1] ?? "").slice(0, MAX);

  if (l1 && l2) {
    return { title: `${l1} ${l2}`, lines: [l1, l2] };
  }

  // 최후 수단: 전체 텍스트를 10자씩 2줄로 강제 분할
  const combined = t.replace(/\s+/g, " ");
  const phrase1 = getShortPhrase(combined, MAX) || combined.slice(0, MAX);
  const remaining = combined.slice(phrase1.length).trim();
  const phrase2 = getShortPhrase(remaining, MAX) || remaining.slice(0, MAX);
  return {
    title: `${phrase1} ${phrase2}`,
    lines: [phrase1, phrase2 || "정보 확인"],
  };
}
