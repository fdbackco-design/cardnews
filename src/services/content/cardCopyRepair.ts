import type { CardCopyFields } from "./cardCopyValidator";
import {
  hasCompleteSentenceEnding,
  isBrokenKorean,
  LIMITS,
} from "./cardCopyValidator";
import { safeCardTitle } from "./cardTitle";

/** 미완성·절단 문장을 완결 해요체/합니다체로 보정 */
export function repairCardCopy(fields: CardCopyFields, heading = ""): CardCopyFields {
  const highlights = dedupeLines(
    (fields.highlights ?? []).map((h) => repairLine(h, LIMITS.highlightMax, "highlight"))
  );

  return {
    title: repairTitle(fields.title, heading),
    intro: repairLine(fields.intro, LIMITS.introMax, "intro"),
    highlights,
    outro: fields.outro?.trim()
      ? repairLine(fields.outro, LIMITS.outroMax, "outro")
      : undefined,
  };
}

function dedupeLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (out.some((x) => x === line || x.slice(0, 12) === line.slice(0, 12))) continue;
    out.push(line);
  }
  return out.slice(0, 2);
}

function repairTitle(title: string, heading: string): string {
  const t = title.trim();
  if (t.length <= LIMITS.titleMax && !isBrokenKorean(t) && !/[(\[（]/.test(t)) {
    return t;
  }
  return safeCardTitle(heading || t);
}

function repairLine(text: string, maxLen: number, _kind: string): string {
  let t = text.trim().replace(/…|\.\.\./g, "");
  if (!t) {
    // generic 문구 주입 금지 — 빈 값은 그대로 두고 상위 validator/재시도 로직에 맡긴다.
    return "";
  }

  t = t
    .replace(/(으로|에서|및|의|를|을)\s*예요\.?$/g, "입니다.")
    .replace(/(니다|습니다|합니다|됩니다)예요\.?$/g, "$1.")
    .replace(/예요예요|해요예요/g, "해요");

  if (/이란\s*$/.test(t)) t = t.replace(/이란\s*$/, "에 대해 알아볼게요.");
  if (/하지만\.?$/.test(t)) t = t.replace(/하지만\.?$/, "하지만 주의가 필요해요.");
  if (/하고\.?$/.test(t)) t = t.replace(/하고\.?$/, "하고 있어요.");
  if (/된다\.?$/.test(t)) t = t.replace(/된다\.?$/, "될 수 있어요.");
  if (/있다\.?$/.test(t)) t = t.replace(/있다\.?$/, "있어요.");
  if (/꼽힙니다\.?$/.test(t)) t = t.replace(/꼽힙니다\.?$/, "꼽혀요.");
  if (/심해집니다\.?$/.test(t)) t = t.replace(/심해집니다\.?$/, "심해져요.");
  if (/신나요\.?$/.test(t)) t = t.replace(/신나요\.?$/, "신어 보세요.");
  if (/증가을/.test(t)) t = t.replace(/증가을/g, "증가를");
  if (/나나요\??$/.test(t) || /인가요\??$/.test(t)) {
    /* 질문형 유지 */
  } else if (/[가-힣]{2,}\([^)]+\)\.?$/.test(t) && !hasCompleteSentenceEnding(t)) {
    t = `${t.replace(/\.\s*$/, "")}에 해당할 수 있어요.`;
  } else if (!hasCompleteSentenceEnding(t)) {
    if (/다$/.test(t)) t = `${t.slice(0, -1)}해요.`;
    else if (/[가-힣]$/.test(t)) t = `${t}해요.`;
  }

  if (!t.endsWith(".") && !t.endsWith("?") && !t.endsWith("!")) {
    t = `${t}.`;
  }

  if (t.length > maxLen + 2) {
    // 1) 절(쉼표) 단위로 잘랐을 때 첫 절이 완결이면 그것을 사용
    const clauses = t.split(/[,，]/).map((c) => c.trim()).filter(Boolean);
    if (clauses[0] && clauses[0].length <= maxLen && hasCompleteSentenceEnding(clauses[0])) {
      return clauses[0].endsWith(".") ? clauses[0] : `${clauses[0]}.`;
    }
    // 2) 어절(공백) 경계에서 자른 후 종결어미를 보장
    const truncated = smartTruncateKorean(t, maxLen);
    if (truncated) return truncated;
    // 3) 그래도 안 되면 원본 그대로 반환 (validator가 길이 초과 경고 → 재시도/폴백)
    //    절대 generic 문구로 덮지 않는다.
    return t;
  }

  return t;
}

/**
 * 한국어 문장을 어절 경계에서 자르고 자연스러운 해요체 종결을 붙인다.
 * 자를 위치를 못 찾으면 빈 문자열 반환.
 */
function smartTruncateKorean(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // maxLen 이내에서 마지막 어절 경계를 찾는다
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace < Math.floor(maxLen * 0.5)) return ""; // 너무 앞에서 끊기면 포기
  let head = slice.slice(0, lastSpace).trim();
  head = head.replace(/[,，·\s]+$/, "");
  if (head.length < 6) return "";
  // 이미 종결이면 그대로
  if (hasCompleteSentenceEnding(head)) {
    return head.endsWith(".") ? head : `${head}.`;
  }
  // 마지막 글자가 한글이면 "해요." 부착 (어색하지만 generic 문구보다 정보 보존)
  if (/[가-힣]$/.test(head)) {
    return `${head}해요.`;
  }
  return "";
}
