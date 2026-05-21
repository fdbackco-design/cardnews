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

function repairLine(text: string, maxLen: number, kind: string): string {
  let t = text.trim().replace(/…|\.\.\./g, "");
  if (!t) {
    return kind === "highlight"
      ? "생활 속에서 실천해 보세요."
      : "건강을 위해 꾸준히 관리하세요.";
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
  if (/을\(를\)\s*실천/.test(t)) t = "생활 속에서 실천해 보세요.";
  if (/증가을/.test(t)) t = "운동량은 서서히 늘려 주세요.";
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
    const clauses = t.split(/[,，]/).map((c) => c.trim()).filter(Boolean);
    if (clauses[0] && clauses[0].length <= maxLen && hasCompleteSentenceEnding(clauses[0])) {
      return clauses[0].endsWith(".") ? clauses[0] : `${clauses[0]}.`;
    }
    const short = t.slice(0, maxLen).replace(/[^가-힣a-zA-Z0-9)\]）?]\s*$/g, "").trim();
    if (short.length >= 8 && hasCompleteSentenceEnding(short)) return short;
    return kind === "highlight"
      ? "꾸준한 관리가 도움이 됩니다."
      : "건강을 위해 꾸준히 관리하세요.";
  }

  return t;
}
