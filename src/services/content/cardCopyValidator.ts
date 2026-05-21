/**
 * 카드뉴스 카피 품질 검증 — 비문·미완성·길이 초과 차단
 */

export const LIMITS = {
  titleMax: 15,
  introMax: 25,
  highlightMax: 30,
  highlightMaxCount: 2,
  outroMax: 20,
} as const;

export type CardCopyFields = {
  title: string;
  intro: string;
  highlights?: string[];
  outro?: string;
};

const VALID_ENDINGS =
  /(해요|하세요|합니다|입니다|돼요|세요|있어요|없어요|주세요|드세요|보세요|네요|죠|져요|아파요|나요|가요|닙니다|습니다|생겨요|심해져요|좋아요|위험해요|필요해요|중요해요|인가요|할까요|습니까|이에요|예요)\.?$|나요\?$|인가요\?$/;

const BROKEN_PATTERNS: RegExp[] = [
  /…|\.\.\./,
  /(으로|에서|및|의|를|을|에|와|과)\s*예요/,
  /(니다|습니다|합니다|됩니다|집니다|있습니다)예요/,
  /(으며|하고|이며|라며)\s+있어요/,
  /[가-힣][임음함됨]예요$/,
  /[가-힣][임음함됨]이에요$/,
  /예요예요|해요예요|이에요예요/,
  /[^\s]{1,2}이에요$/,
  /[가-힣]난해요$|[가-힣]된해요$/,
  /\s과\s+해요/,
  /\(RS$|\([A-Za-z]{1,4}$/,
  /[(\[（][^)\]）]*$/,
  /\s(및|으로|에서|의|에)\s*\.?$/,
];

export function isBrokenKorean(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  return BROKEN_PATTERNS.some((re) => re.test(t));
}

export function hasCompleteSentenceEnding(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isBrokenKorean(t)) return false;
  return VALID_ENDINGS.test(t);
}

export function isIncompleteTitle(title: string): boolean {
  const t = title.trim();
  if (!t || t.length > LIMITS.titleMax) return true;
  if (isBrokenKorean(t)) return true;
  if (/[(\[（]/.test(t) && !/[)\]）]/.test(t)) return true;
  if (/\s*(및|으로|에서|의|에|와|과)\s*$/.test(t)) return true;
  if (/[.!?。]$/.test(t)) return true;
  return false;
}

export function validateCardCopy(fields: CardCopyFields): string[] {
  const errors: string[] = [];
  const { title, intro, highlights, outro } = fields;

  if (isIncompleteTitle(title)) {
    errors.push(`title: 미완성·초과(${title.length}자) — "${title}"`);
  }

  const introGrace = LIMITS.introMax + 4;
  if (!intro.trim() || intro.length > introGrace) {
    errors.push(`intro: 길이(${intro.length}자, 허용~${introGrace}) 또는 비어 있음`);
  } else if (!hasCompleteSentenceEnding(intro)) {
    errors.push(`intro: 종결 어미 불완전 — "${intro}"`);
  }

  const hl = highlights ?? [];
  if (hl.length === 0) {
    errors.push("highlights: 최소 1개 필요");
  }
  if (hl.length > LIMITS.highlightMaxCount) {
    errors.push(`highlights: 최대 ${LIMITS.highlightMaxCount}개`);
  }
  hl.forEach((h, i) => {
    const hlGrace = LIMITS.highlightMax + 4;
    if (!h.trim() || h.length > hlGrace) {
      errors.push(`highlights[${i}]: 길이(${h.length}자, 허용~${hlGrace}) 또는 비어 있음`);
    } else if (!hasCompleteSentenceEnding(h)) {
      errors.push(`highlights[${i}]: 종결 어미 불완전 — "${h}"`);
    }
  });

  if (outro?.trim()) {
    if (outro.length > LIMITS.outroMax + 4) {
      errors.push(`outro: 길이(${outro.length}자) 초과`);
    } else if (!hasCompleteSentenceEnding(outro)) {
      errors.push(`outro: 종결 어미 불완전 — "${outro}"`);
    }
  }

  return errors;
}

export function validateCardNewsDeck(
  cards: CardCopyFields[]
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  cards.forEach((c, i) => {
    const cardErrors = validateCardCopy(c);
    cardErrors.forEach((e) => errors.push(`[카드 ${i + 1}] ${e}`));
  });
  return { ok: errors.length === 0, errors };
}
