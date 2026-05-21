import { safeCardTitle } from "../services/content/cardTitle";

// ── 기본 유틸 ─────────────────────────────────────────────────────────────────

/** 카드 UI용 (레거시). 카드 본문 요약에는 `fitWithoutEllipsis` 사용 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}

export function splitIntoLines(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    if (current.length >= maxCharsPerLine && char === " ") {
      lines.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) lines.push(current.trim());
  return lines;
}

export function parseCliArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=?(.*)$/);
    if (match) {
      const [, key, value] = match;
      args[key] = value ?? "true";
    }
  }
  return args;
}

// ── 카드뉴스 카피 상수 ─────────────────────────────────────────────────────────

/** 카드 1장 — 제목+본문(intro·highlight·outro) 공백 포함 목표 글자 수 */
export const CARD_TITLE_BODY_TARGET = 100;
export const CARD_TITLE_MAX         = 14;
export const CARD_HIGHLIGHT_MAX       = 48;
export const CARD_HIGHLIGHT_MAX_N     = 2;
export const CARD_INTRO_TARGET        = 68;
export const CARD_OUTRO_TARGET        = 32;

/** @deprecated 본문만 셀 때 — `countCardPageChars` 사용 권장 */
export const CARD_COPY_MAX_TOTAL = 88;

// ── 정규화 ───────────────────────────────────────────────────────────────────

export function normalizeKoreanText(raw: string): string {
  return raw
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*⦁\s*/g, " ⦁ ")
    .trim();
}

export function hasEllipsis(text: string): boolean {
  return /…|\.\.\./.test(text);
}

/** 말줄임표 없이 maxLen 이내로 맞춤 */
export function fitWithoutEllipsis(
  text: string,
  maxLen: number,
  opts?: { polite?: boolean }
): string {
  const t = normalizeKoreanText(text);
  if (t.length <= maxLen) {
    return opts?.polite === false ? t : polishPoliteEnding(t);
  }

  const cutPoints = [
    t.lastIndexOf(". ", maxLen),
    t.lastIndexOf("요. ", maxLen),
    t.lastIndexOf("요 ", maxLen),
    t.lastIndexOf("다 ", maxLen),
    t.lastIndexOf(", ", maxLen),
    t.lastIndexOf(" ", maxLen),
  ].filter((i) => i >= Math.floor(maxLen * 0.45));

  let cut = cutPoints.length > 0 ? Math.max(...cutPoints) : maxLen;
  if (cut < Math.floor(t.length * 0.5)) {
    cut = t.lastIndexOf(" ", maxLen);
    if (cut < Math.floor(maxLen * 0.45)) cut = maxLen;
  }
  let slice = t.slice(0, cut > 0 ? cut : maxLen).trim();
  slice = slice.replace(/[,，、‘’"']\s*$/, "").replace(/요$/, "요");

  if (opts?.polite === false) return slice;

  const polished = polishPoliteEnding(slice);
  if (!isBrokenCopyLine(polished)) return polished;

  const shorter = t.slice(0, Math.floor(maxLen * 0.65)).trim();
  const retry = polishPoliteEnding(shorter);
  return isBrokenCopyLine(retry) ? polished : retry;
}

function hasPoliteStem(core: string): boolean {
  if (isBrokenCopyLine(`${core}.`)) return false;
  return /(해요|돼요|세요|습니다|네요|죠|입니다|어요|아요|여요|으세요|있어요|없어요|할게요|볼게요|보세요|피해요|착용해요|드세요|이에요|집니다|됩니다|합니다)$/.test(
    core
  );
}

function hasBatchimChar(ch: string): boolean {
  if (!/[가-힣]/.test(ch)) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code % 28 !== 0;
}

function attachIeyo(core: string): string {
  const phrase = core.trim();
  if (!phrase) return "예요.";
  const lastWord = phrase.split(/\s+/).pop() ?? phrase;
  const lastChar = lastWord.slice(-1);
  if (!/[가-힣]/.test(lastChar)) return `${phrase}예요.`;
  return hasBatchimChar(lastChar) ? `${phrase}이에요.` : `${phrase}예요.`;
}

function isBrokenCopyLine(s: string): boolean {
  const core = s.replace(/[.!?。]+$/, "").trim();
  if (hasEllipsis(s)) return true;
  if (/[을를이가]\s*예요$/.test(core)) return true;
  if (/의예요$|의이에요$|[을를]이에요$/.test(core)) return true;
  if (/예요예요|해요예요|이에요예요/.test(s)) return true;
  if (/[^\s]{1,2}이에요$/.test(core)) return true;
  if (/[가-힣]기예요$/.test(core)) return true;
  if (/(띠|걷기)\s+있습니다/.test(s)) return true;
  if (/[가-힣][임음함됨설]예요$/.test(core)) return true;
  if (/[가-힣][임음함됨]이에요$|짐이에요$|됨이에요$/.test(core)) return true;
  if (/[가-힣]난해요$|[가-힣]된해요$/.test(core)) return true;
  if (/\s과\s+해요/.test(core)) return true;
  if (/(질환|경우|통증|증상|염)예요$/.test(core)) return true;
  if (/있해요$/.test(core)) return true;
  if (/(된|할|를|을|수)해요$/.test(core)) return true;
  if (/[된한할]해요$/.test(core)) return true;
  if (/[고며하여]$/.test(core)) return true;
  return false;
}

function isUsableCopyLine(s: string): boolean {
  if (!s || s.length < 6) return false;
  if (isBrokenCopyLine(s)) return false;
  const core = s.replace(/[.!?。]+$/, "").trim();
  return hasPoliteStem(core) || /(다|요|죠)$/.test(core);
}

/** 본문 카피는 존댓말(해요/세요/습니다)로 마무리 */
export function polishPoliteEnding(text: string): string {
  let t = text.trim();
  if (!t) return t;

  t = t
    .replace(/(해요|예요|어요|아요|이에요)예요/g, "$1")
    .replace(/해요해요/g, "해요")
    .replace(/예요예요/g, "예요");

  if (hasPoliteStem(t.replace(/[.!?。]+$/, ""))) {
    return t.endsWith(".") || t.endsWith("!") || t.endsWith("?") ? t : `${t}.`;
  }

  if (/[.!?。]$/.test(t)) {
    const core = t.replace(/[.!?。]+$/, "").trim();
    if (hasPoliteStem(core)) return t;
    if (/과다$/.test(core)) return `${core}한 경우가 있어요.`;
    if (/다$/.test(core) && !/니다$/.test(core)) return `${core.slice(0, -1)}해요.`;
    if (/수$/.test(core)) return `${core} 있어요.`;
    if (/[고며하여]$/.test(core)) return `${core} 있어요.`;
    if (core.length >= 8 && !hasPoliteStem(core)) {
      if (/[()]/.test(core)) return `${core}에 해당할 수 있어요.`;
      return attachIeyo(core);
    }
    return t;
  }

  if (/과다$/.test(t)) return `${t}한 경우가 있어요.`;
  if (/다$/.test(t) && !/니다$/.test(t)) {
    return `${t.slice(0, -1)}해요.`;
  }
  if (/수$/.test(t)) return `${t} 있어요.`;
  if (/[고며하여]$/.test(t)) return `${t} 있어요.`;
  if (/[가-힣]$/.test(t)) {
    if (/[()]/.test(t)) return `${t}에 해당할 수 있어요.`;
    return attachIeyo(t);
  }
  return t;
}

// ── 문장 분리 · 필터 ─────────────────────────────────────────────────────────

export function splitSentences(text: string): string[] {
  return normalizeKoreanText(text)
    .split(/(?<=[.!?。])\s+|(?=⦁)/)
    .map((s) => s.replace(/^⦁\s*/, "⦁ ").trim())
    .filter((s) => s.length >= 4);
}

export function extractBulletLines(text: string): string[] {
  const bullets: string[] = [];
  for (const part of text.split(/⦁/)) {
    const line = normalizeKoreanText(part);
    if (line.length >= 6) bullets.push(line);
  }
  return bullets;
}

const BOILERPLATE_PATTERNS = [
  /이달의\s*건강정보/,
  /알아보겠습니다/,
  /확인해\s*보겠습니다/,
  /함께\s*살펴/,
  /소개합니다/,
  /※\s*/,
  /다음과\s*같은/,
  /아래\s*(자가\s*)?진단/,
  /체크리스트를\s*보면서/,
];

export function isBoilerplateSentence(sentence: string): boolean {
  const t = sentence.trim();
  if (t.length < 4) return true;
  return BOILERPLATE_PATTERNS.some((re) => re.test(t));
}

// ── 요약(압축) ─────────────────────────────────────────────────────────────────

const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/발뒤꿈치뼈에서\s*시작해\s*발가락\s*쪽으로\s*이어지는\s*두껍고\s*강한\s*섬유\s*띠를\s*말합니다/g, "발바닥 아치를 지탱하는 섬유 띠"],
  [/한\s*번의\s*큰\s*충격보다는\s*반복적인\s*과부하로\s*인해\s*발생하는\s*경우가\s*대부분입니다/g, "반복적인 과부하로 생기는 경우가 많아요"],
  [/가장\s*특징적인\s*증상은/g, "대표 증상은"],
  [/을\s*말합니다/g, "예요"],
  [/입니다\.?$/g, "예요."],
  [/됩니다\.?$/g, "돼요."],
  [/합니다\.?$/g, "해요."],
  [/집니다\.?$/g, "져요."],
  [/있습니다\.?$/g, "있어요."],
  [/없습니다\.?$/g, "없어요."],
  [/수\s*있습니다/g, "수 있어요"],
  [/주의가\s*필요합니다/g, "주의가 필요해요"],
  [/도움이\s*됩니다/g, "도움이 돼요"],
  [/매우\s*중요합니다/g, "중요해요"],
  [/꾸준히\s*실천/g, "꾸준히 실천"],
  [/심해집니다/g, "심해져요"],
  [/계속됩니다/g, "계속돼요"],
  [/짧고\s*딱딱한\s*경우입니다/g, "짧고 딱딱해요"],
  [/나타납니다/g, "나타나요"],
  [/생기는\s*질환입니다/g, "생기는 질환이에요"],
  [/경우입니다/g, "경우가 있어요"],
];

function sanitizeForSummary(sentence: string): string {
  let t = normalizeKoreanText(sentence.replace(/^⦁\s*/, ""));
  if ((t.match(/[''‘’]/g) ?? []).length % 2 === 1) {
    t = t.replace(/[''‘’][^''‘’]*$/, "").trim();
  }
  return t.replace(/[''""]/g, "").trim();
}

function fixAwkwardYoEnding(text: string): string {
  const t = text.trim();
  if (/^[가-힣]{2,10}요\.?$/.test(t) && !/(있어요|해요|돼요|된다|합니다|세요)/.test(t)) {
    return t.replace(/요\.?$/, "이 있어요.");
  }
  return t;
}

export function compressSentence(sentence: string, targetLen: number): string {
  let t = sanitizeForSummary(sentence);
  if (/[:：]/.test(t)) {
    const tail = t.split(/[:：]/).pop()?.trim();
    if (tail && tail.length >= 8) t = tail;
  }
  for (const [re, rep] of PHRASE_REPLACEMENTS) {
    t = t.replace(re, rep);
  }
  t = t
    .replace(/\([^)]{8,}\)/g, "")
    .replace(/『[^』]+』/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const finish = (line: string) => {
    const out = fixAwkwardYoEnding(polishPoliteEnding(line));
    return isUsableCopyLine(out) ? out : "";
  };

  if (t.length <= targetLen) {
    const out = finish(t);
    if (out) return out;
  }

  const clauses = t.split(/[,，、]/).map((c) => c.trim()).filter(Boolean);
  if (clauses.length > 1) {
    const first = clauses[0]!;
    if (first.length >= 12 && first.length <= targetLen) {
      const out = finish(first);
      if (out) return out;
    }
  }

  for (const len of [targetLen, targetLen + 10, targetLen + 20, t.length]) {
    const fitted = fitWithoutEllipsis(t, Math.min(t.length, len), { polite: true });
    if (fitted.length >= 12) {
      const out = finish(fitted);
      if (out) return out;
    }
  }

  const fallback = finish(t.slice(0, Math.min(t.length, targetLen)));
  if (fallback) return fallback;

  return fixAwkwardYoEnding(
    polishPoliteEnding(t.length <= targetLen + 15 ? t : t.slice(0, targetLen))
  );
}

// ── 섹션 제목 축약 ─────────────────────────────────────────────────────────────

/** 카드 제목 축약 — `safeCardTitle` 위임 */
export function shortenSectionHeading(heading: string): string {
  return safeCardTitle(heading);
}

// ── 하이라이트 선택 ───────────────────────────────────────────────────────────

function scoreHighlightCandidate(line: string, heading: string): number {
  let score = 0;
  const t = line.toLowerCase();
  const h = heading.toLowerCase();

  if (line.length >= 12 && line.length <= 38) score += 30;
  if (line.length > 45) score -= 40;
  if (/증상|아프|통증|불편/.test(t)) score += 25;
  if (/원인|과다|습관/.test(t)) score += 20;
  if (/관리|스트레칭|운동|찜|얼음|휴식/.test(t)) score += 22;
  if (/병원|진료|검진|방문/.test(t)) score += 24;
  if (/해당|이상|주의|필요/.test(t)) score += 18;
  if (/이란|개요|소개/.test(t)) score -= 30;
  if (isBoilerplateSentence(line)) score -= 50;
  if (/체크리스트/.test(h) && /해당|이상|2개/.test(t)) score += 15;

  return score;
}

function isSimilarText(a: string, b: string): boolean {
  const x = a.replace(/\s/g, "").slice(0, 20);
  const y = b.replace(/\s/g, "").slice(0, 20);
  return x.length >= 8 && (y.includes(x) || x.includes(y));
}

function summarizeBulletLine(line: string): string {
  let t = sanitizeForSummary(line);
  if (/[:：]/.test(t)) {
    const tail = t.split(/[:：]/).pop()?.trim();
    if (tail && tail.length >= 6) t = tail;
  }
  for (const [re, rep] of PHRASE_REPLACEMENTS) {
    t = t.replace(re, rep);
  }
  t = t.replace(/\s+/g, " ").trim();

  const firstClause = t.split(/[,，]/).map((c) => c.trim()).find((c) => c.length >= 8) ?? t;
  const candidate =
    firstClause.length <= CARD_HIGHLIGHT_MAX
      ? firstClause
      : fitWithoutEllipsis(firstClause, CARD_HIGHLIGHT_MAX);

  let out = candidate;
  if (/[)]$/.test(out.replace(/\.\s*$/, ""))) {
    out = `${out}에 해당할 수 있어요`;
  }
  out = polishPoliteEnding(out.endsWith(".") ? out : `${out}.`);
  return isUsableCopyLine(out) ? out : "";
}

function compressHighlightLine(line: string): string {
  return summarizeBulletLine(line);
}

function pickHighlights(
  bullets: string[],
  sentences: string[],
  heading: string,
  intro: string
): string[] {
  const bulletCompressed = bullets
    .map((b) => compressHighlightLine(b))
    .filter(
      (c) =>
        c.length >= 6 &&
        c.length <= CARD_HIGHLIGHT_MAX &&
        !/[''‘’]/.test(c) &&
        isUsableCopyLine(c)
    );

  const sentenceCompressed = sentences
    .filter((s) => !isBoilerplateSentence(s) && !s.startsWith("⦁") && !/[''‘’]/.test(s))
    .map((s) => compressHighlightLine(s))
    .filter((c) => c.length >= 8 && c.length <= CARD_HIGHLIGHT_MAX);

  const candidates = (bulletCompressed.length > 0 ? bulletCompressed : sentenceCompressed)
    .map((c) => normalizeKoreanText(c))
    .filter(
      (c) =>
        c.length >= 8 &&
        !hasEllipsis(c) &&
        !isSimilarText(c, intro) &&
        !intro.replace(/\s/g, "").includes(c.replace(/\s/g, "").slice(0, 14))
    );

  const ranked = [...new Set(candidates)].sort(
    (a, b) => scoreHighlightCandidate(b, heading) - scoreHighlightCandidate(a, heading)
  );

  const best =
    ranked.find((c) => !isSimilarText(c, intro)) ??
    ranked[1] ??
    ranked[0];
  if (!best) return [];

  const second = ranked.find(
    (c) =>
      c !== best &&
      scoreHighlightCandidate(c, heading) >= 12 &&
      !isSimilarText(c, best)
  );

  if (second && CARD_HIGHLIGHT_MAX_N >= 2 && isUsableCopyLine(second)) {
    return [best, second];
  }

  if (bulletCompressed.length > 1 && CARD_HIGHLIGHT_MAX_N >= 2) {
    const alt = bulletCompressed.find(
      (c) => c !== best && isUsableCopyLine(c) && !isSimilarText(c, intro) && !isSimilarText(c, best)
    );
    if (alt) return [best, alt];
  }

  return isUsableCopyLine(best) ? [best] : [];
}

// ── 카드 본문 조립 ─────────────────────────────────────────────────────────────

/** 제목+본문 전체 길이 (공백 포함) */
export function countCardPageChars(
  cardTitle: string,
  intro: string,
  highlights?: string[],
  outro?: string
): number {
  const parts = [cardTitle, intro, ...(highlights ?? []), outro ?? ""].filter(Boolean);
  return parts.join(" ").length;
}

/** 본문만 (공백 포함) */
export function countCardBodyChars(
  intro: string,
  highlights?: string[],
  outro?: string
): number {
  const parts = [intro, ...(highlights ?? []), outro ?? ""].filter(Boolean);
  return parts.join(" ").length;
}

/** @deprecated 공백 제외 — `countCardPageChars` 사용 */
export function countCardCopyChars(
  intro: string,
  highlights?: string[],
  outro?: string
): number {
  const parts = [intro, ...(highlights ?? []), outro ?? ""].filter(Boolean);
  return parts.join("").replace(/\s/g, "").length;
}

function stripEllipsis(s: string): string {
  return s.replace(/…/g, "").replace(/\.\.\./g, "").trim();
}

function finalizeCopyLine(s: string, strict = true): string {
  const base = polishPoliteEnding(stripEllipsis(s))
    .replace(/해요예요/g, "해요")
    .replace(/예요예요/g, "예요");
  if (isUsableCopyLine(base)) return base;
  if (!strict) return base;
  const loose = polishPoliteEnding(stripEllipsis(s));
  return isBrokenCopyLine(loose) ? "" : loose;
}

function fitToTitleBodyBudget(
  cardTitle: string,
  intro: string,
  highlights: string[] | undefined,
  outro: string | undefined
): { intro: string; highlights?: string[]; outro?: string } {
  const originalIntro = intro;
  let i = finalizeCopyLine(intro, false);
  if (!i.trim()) i = polishPoliteEnding(stripEllipsis(intro));
  let h = highlights?.map((x) => finalizeCopyLine(x)).filter((x) => x.length > 0);
  const outroLine = outro ? finalizeCopyLine(outro) : "";
  let o = outroLine.length > 0 ? outroLine : undefined;

  const within = () => countCardPageChars(cardTitle, i, h, o) <= CARD_TITLE_BODY_TARGET;

  while (!within() && h && h.length > 1) {
    h = h.slice(0, -1);
  }
  while (!within() && o) {
    o = undefined;
  }
  for (let guard = 0; !within() && i.length > 42 && guard < 5; guard++) {
    const prevLen = i.length;
    const shorter = compressSentence(i, Math.max(36, i.length - 8));
    if (!shorter.trim() || shorter.length >= prevLen) break;
    i = finalizeCopyLine(shorter, false);
  }
  if (!within() && h && h.length > 1) {
    h = h.slice(0, 1);
  }

  if (!i.trim()) {
    i = finalizeCopyLine(originalIntro, false) || polishPoliteEnding(stripEllipsis(originalIntro));
  }

  return {
    intro: i,
    highlights: h && h.length > 0 ? h : undefined,
    outro: o,
  };
}

function bodyBudgetForTitle(cardTitle: string): number {
  return Math.max(48, CARD_TITLE_BODY_TARGET - cardTitle.length - 3);
}

function pickIntroSource(
  heading: string,
  substantive: string[],
  bullets: string[],
  sentences: string[],
  normalized: string
): string {
  if (/증상/.test(heading)) {
    return (
      substantive.find(
        (s) =>
          /증상|아프|통증|첫발/.test(s) &&
          !/[''‘’]/.test(s) &&
          s.length >= 20
      ) ??
      substantive[1] ??
      substantive[0] ??
      normalized
    );
  }
  if (/원인/.test(heading)) {
    return substantive[0] ?? bullets[0] ?? normalized;
  }
  return (
    substantive.find(
      (s) =>
        !s.startsWith("⦁") &&
        !/체크리스트/.test(s) &&
        !/[''‘’]/.test(s)
    ) ??
    substantive.find((s) => !s.startsWith("⦁") && !/체크리스트/.test(s)) ??
    substantive[0] ??
    bullets[0] ??
    sentences[0] ??
    normalized
  );
}

function pickOutroSource(
  introSource: string,
  substantive: string[],
  sentences: string[],
  intro: string
): string | undefined {
  const pool = [...substantive, ...sentences].filter(
    (s) =>
      s !== introSource &&
      s.length >= 14 &&
      !isBoilerplateSentence(s) &&
      !isSimilarText(s, intro) &&
      !/[''‘’]/.test(s)
  );
  for (const s of pool) {
    if (s.startsWith("⦁")) continue;
    const trial = compressSentence(sanitizeForSummary(s), CARD_OUTRO_TARGET);
    if (isUsableCopyLine(trial)) return s;
  }
  return undefined;
}

function nudgeTowardTarget(
  cardTitle: string,
  intro: string,
  highlights: string[] | undefined,
  outro: string | undefined,
  introSource: string,
  heading: string,
  body: string
): { intro: string; highlights?: string[]; outro?: string } {
  const minFill = CARD_TITLE_BODY_TARGET - 3;
  let i = intro;
  let h = highlights;
  let o = outro;

  const count = () => countCardPageChars(cardTitle, i, h, o);

  if (count() >= minFill) {
    return { intro: i, highlights: h, outro: o };
  }

  const budget = bodyBudgetForTitle(cardTitle);
  const longerIntro = compressSentence(
    sanitizeForSummary(introSource),
    Math.min(budget - 6, CARD_INTRO_TARGET + 24)
  );
  let expanded = fitToTitleBodyBudget(cardTitle, longerIntro || intro, h, o);
  i = expanded.intro;
  h = expanded.highlights;
  o = expanded.outro;

  const bodySentences = splitSentences(body).filter((s) => !isBoilerplateSentence(s));
  const bodySubstantive = bodySentences.filter((s) => s.length >= 10);

  if (!o && countCardPageChars(cardTitle, i, h, o) < minFill) {
    const outroSrc = pickOutroSource(introSource, bodySubstantive, bodySentences, i);
    if (outroSrc) {
      const candidate = compressSentence(sanitizeForSummary(outroSrc), CARD_OUTRO_TARGET);
      if (isUsableCopyLine(candidate)) {
        expanded = fitToTitleBodyBudget(cardTitle, i, h, finalizeCopyLine(candidate));
        i = expanded.intro;
        h = expanded.highlights;
        o = expanded.outro;
      }
    }
  }

  if (countCardPageChars(cardTitle, i, h, o) < minFill) {
    const merged = [...(h ?? [])];
    for (const b of extractBulletLines(normalizeKoreanText(body))) {
      if (merged.length >= CARD_HIGHLIGHT_MAX_N) break;
      const line = summarizeBulletLine(b);
      if (
        line &&
        isUsableCopyLine(line) &&
        !merged.includes(line) &&
        !isSimilarText(line, i) &&
        !merged.some((x) => isSimilarText(x, line))
      ) {
        merged.push(line);
      }
    }
    if (merged.length > (h?.length ?? 0)) {
      expanded = fitToTitleBodyBudget(cardTitle, i, merged, o);
    }
  }

  if (
    expanded.outro &&
    (isSimilarText(expanded.outro, expanded.intro) ||
      expanded.highlights?.some((x) => isSimilarText(x, expanded.outro!)))
  ) {
    expanded = { ...expanded, outro: undefined };
  }

  return expanded;
}

export function summarizeSectionToCardCopy(
  body: string,
  heading: string,
  cardTitle: string
): { intro: string; highlights?: string[]; outro?: string } {
  const normalized = normalizeKoreanText(body);
  const bullets    = extractBulletLines(normalized);
  const sentences  = splitSentences(normalized).filter((s) => !isBoilerplateSentence(s));
  const substantive = sentences.filter((s) => s.length >= 10);
  const introBudget = Math.min(CARD_INTRO_TARGET, bodyBudgetForTitle(cardTitle) - 20);

  // 증상·관리: 서술 1~2문장 + 불릿 1~2개
  if (/증상|관리법|관리/.test(heading) && bullets.length > 0) {
    const prose =
      substantive.find(
        (s) =>
          !s.startsWith("⦁") &&
          s.length >= 22 &&
          !/[''‘’]/.test(s)
      ) ?? substantive[0];

    const introSource = prose ?? normalized;
    let intro = prose
      ? compressSentence(sanitizeForSummary(prose), introBudget) ||
        fixAwkwardYoEnding(polishPoliteEnding(sanitizeForSummary(prose).slice(0, introBudget)))
      : compressSentence(sanitizeForSummary(normalized), introBudget) ||
        fixAwkwardYoEnding(polishPoliteEnding(sanitizeForSummary(normalized).slice(0, introBudget)));

    let highlights: string[] | undefined = pickHighlights(bullets, sentences, heading, intro);
    if (!highlights?.length) {
      const bulletPick =
        bullets.find((b) => b.length >= 8 && !/[''‘’]/.test(b)) ?? bullets[0];
      const line = bulletPick ? summarizeBulletLine(bulletPick) : "";
      highlights = line ? [line] : undefined;
    }

    const outroSrc = pickOutroSource(introSource, substantive, sentences, intro);
    let outro = outroSrc
      ? compressSentence(sanitizeForSummary(outroSrc), CARD_OUTRO_TARGET)
      : undefined;
    if (outro && isSimilarText(outro, intro)) outro = undefined;

    let fitted = fitToTitleBodyBudget(cardTitle, intro, highlights, outro);
    fitted = nudgeTowardTarget(
      cardTitle,
      fitted.intro,
      fitted.highlights,
      fitted.outro,
      introSource,
      heading,
      normalized
    );
    return fitted;
  }

  const introSource = pickIntroSource(heading, substantive, bullets, sentences, normalized);
  let intro =
    compressSentence(sanitizeForSummary(introSource), introBudget) ||
    fixAwkwardYoEnding(polishPoliteEnding(sanitizeForSummary(introSource).slice(0, introBudget)));
  let highlights = pickHighlights(bullets, sentences, heading, intro);

  if (bullets.length >= 2 && (!highlights || highlights.length < CARD_HIGHLIGHT_MAX_N)) {
    const filled = [...(highlights ?? [])];
    for (const b of bullets) {
      if (filled.length >= CARD_HIGHLIGHT_MAX_N) break;
      const line = summarizeBulletLine(b);
      if (
        line &&
        isUsableCopyLine(line) &&
        !filled.includes(line) &&
        !isSimilarText(line, intro) &&
        !filled.some((x) => isSimilarText(x, line))
      ) {
        filled.push(line);
      }
    }
    if (filled.length > 0) highlights = filled;
  }

  const outroSrc = pickOutroSource(introSource, substantive, sentences, intro);
  let outro = outroSrc
    ? compressSentence(sanitizeForSummary(outroSrc), CARD_OUTRO_TARGET)
    : undefined;
  if (outro) {
    const o = outro;
    if (isSimilarText(o, intro) || (highlights ?? []).some((h) => isSimilarText(h, o))) {
      outro = undefined;
    }
  }

  let fitted = fitToTitleBodyBudget(cardTitle, intro, highlights, outro);
  fitted = nudgeTowardTarget(
    cardTitle,
    fitted.intro,
    fitted.highlights,
    fitted.outro,
    introSource,
    heading,
    normalized
  );
  return fitted;
}

// ── 시각적 imageQuery (영문) ───────────────────────────────────────────────────

const VISUAL_QUERY_RULES: Array<{ re: RegExp; terms: string[] }> = [
  { re: /족저|발뒤꿈치|발바닥|아치|발가락/, terms: ["foot arch stretch at home", "massage ball under foot", "heel pain morning step"] },
  { re: /증상|아프|통증|찌릿/, terms: ["Korean adult touching heel pain", "sore foot sole close up"] },
  { re: /원인|운동|걷기|달리기|과다/, terms: ["running shoes on wooden floor", "park walking path morning light"] },
  { re: /체크리스트|자가\s*진단/, terms: ["health checklist notebook pen desk", "Korean adult reviewing notes"] },
  { re: /관리|스트레칭|찜|얼음|휴식/, terms: ["calf stretching against wall", "ice pack wrapped towel foot rest"] },
  { re: /병원|진료|방문/, terms: ["clinic consultation room calm", "Korean adult talking with doctor"] },
  { re: /혈압|수축기|이완기/, terms: ["blood pressure cuff arm home", "health journal blood pressure log"] },
  { re: /식단|영양|나트륨|채소/, terms: ["balanced Korean meal vegetables table", "fresh vegetables kitchen counter"] },
  { re: /수면|잠|피로/, terms: ["neatly made bed morning light", "quiet bedroom soft curtains"] },
  { re: /스트레스|명상|호흡/, terms: ["calm indoor plant window light", "Korean adult eyes closed breathing"] },
];

export function buildVisualImageQuery(
  cardTitle: string,
  sectionHeading: string,
  body: string,
  cardIndex: number
): string {
  const corpus = `${cardTitle} ${sectionHeading} ${body}`;
  const terms  = new Set<string>();

  for (const { re, terms: list } of VISUAL_QUERY_RULES) {
    if (re.test(corpus)) {
      terms.add(list[cardIndex % list.length]!);
    }
  }

  if (terms.size === 0) {
    terms.add("Korean adult healthy lifestyle home");
    terms.add(cardIndex % 2 === 0 ? "warm natural window light" : "calm indoor minimal scene");
  }

  terms.add("editorial photography");
  terms.add("no text no letters");

  return [...terms].slice(0, 5).join(", ");
}
