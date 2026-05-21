import { LIMITS } from "./cardCopyValidator";

const TITLE_ALIASES: Array<[RegExp, string]> = [
  [/자가\s*진단\s*체크리스트/i, "자가 진단"],
  [/집에서\s*바로\s*할\s*수\s*있는\s*관리법/i, "관리 실천법"],
  [/병원\s*방문이\s*필요한\s*경우/i, "병원 방문"],
  [/자주\s*하는\s*질문/i, "자주 묻는 질문"],
  [/호흡기세포융합바이러스|RS\s*바이러스|RSV/i, "RS 바이러스"],
];

/** 카드 제목 — 괄호·조사 미완성 없이 명사형으로 (최대 15자) */
export function safeCardTitle(heading: string): string {
  let h = heading.replace(/\?+$/g, "").trim();
  if (!h) return "핵심 정보";

  for (const [re, label] of TITLE_ALIASES) {
    if (re.test(h)) return label.length <= LIMITS.titleMax ? label : label.slice(0, LIMITS.titleMax);
  }

  if (/이란\??$/.test(h)) h = h.replace(/이란\??$/, "").trim();

  const ofMatch = h.match(/^.+의\s+(.+)$/);
  if (ofMatch) {
    h = ofMatch[1]!.trim();
    if (/원인$/.test(h)) h = "주요 원인";
    if (/증상$/.test(h)) h = "주요 증상";
  }

  h = h.replace(/[(\[（][^)\]）]*$/g, "").replace(/\s*(및|으로|에서|의|에)\s*$/g, "").trim();

  if (h.length > LIMITS.titleMax) {
    const cut = h.slice(0, LIMITS.titleMax);
    const lastSpace = cut.lastIndexOf(" ");
    h = (lastSpace > 6 ? cut.slice(0, lastSpace) : cut).replace(/[(\[（,，、\s]+$/g, "").trim();
  }

  return h || "핵심 정보";
}
