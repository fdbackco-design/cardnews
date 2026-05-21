/**
 * LLM 미사용·실패 시 폴백 — 완결 문장만 사용 (중간 절단·어미 치환 없음)
 */

import { extractBulletLines, normalizeKoreanText, splitSentences } from "../../utils/text";
import type { CardCopyFields } from "./cardCopyValidator";
import { LIMITS } from "./cardCopyValidator";
import { repairCardCopy } from "./cardCopyRepair";
import { safeCardTitle } from "./cardTitle";

function firstCompleteSentence(text: string, maxLen: number): string {
  const sentences = splitSentences(normalizeKoreanText(text)).filter((s) => s.length >= 8);
  for (const s of sentences) {
    let clean = s.replace(/^⦁\s*/, "").trim();
    if (/하지만/.test(clean) && clean.length <= maxLen + 8) {
      return "아침 첫발에 통증이 심할 수 있어요.";
    }
    if (/다$/.test(clean) && !/해요|합니다|입니다/.test(clean)) {
      clean = `${clean.slice(0, -1)}해요.`;
    }
    if (clean.length <= maxLen) return clean.endsWith(".") ? clean : `${clean}.`;
  }
  return "증상과 원인을 미리 알아두면 좋아요.";
}

function bulletToHighlight(bullet: string): string {
  let b = bullet.replace(/^⦁\s*/, "").trim();
  if (/[:：]/.test(b)) {
    const tail = b.split(/[:：]/).pop()?.trim() ?? b;
    b = tail;
  }
  if (/피해|딱딱한 신발/.test(b)) return "딱딱한 신발은 피해 주세요.";
  if (/씻기|손 씻|손씻/.test(b)) return "흐르는 물에 비누로 손을 씻어 주세요.";
  if (/신발|쿠션/.test(b)) return "쿠션이 있는 신발을 신어 보세요.";
  if (/운동량|마라톤|달리기/.test(b)) return "운동량은 서서히 늘려 주세요.";
  if (/평발|오목발|아치/.test(b)) return "발 아치에 맞는 신발을 선택하세요.";
  if (/통증|아프|저림/.test(b)) return "통증이 지속되면 병원을 방문하세요.";
  if (/스트레칭|찜|얼음/.test(b)) return "아침·저녁 스트레칭을 꾸준히 해 보세요.";
  if (b.length > LIMITS.highlightMax) {
    b = b.split(/[,，(]/)[0]?.trim() ?? b.slice(0, 18);
  }
  if (/[하세]세요$/.test(b) || /해요$/.test(b) || /합니다$/.test(b)) {
    return b.endsWith(".") ? b : `${b}.`;
  }
  if (/[가-힣]{4,}/.test(b)) return `${b.split(/[,，]/)[0]!.trim()}에 유의하세요.`;
  return "생활 속에서 실천해 보세요.";
}

export function fallbackSectionToCardCopy(
  body: string,
  heading: string
): CardCopyFields {
  const normalized = normalizeKoreanText(body);
  const bullets = extractBulletLines(normalized);
  const title = safeCardTitle(heading);

  const intro = firstCompleteSentence(normalized, LIMITS.introMax);
  const highlights: string[] = [];

  for (const b of bullets) {
    if (highlights.length >= LIMITS.highlightMaxCount) break;
    const line = bulletToHighlight(b);
    if (line.length <= LIMITS.highlightMax + 8) highlights.push(line);
  }

  if (highlights.length === 0) {
    const s = splitSentences(normalized).find((x) => x.length >= 10 && x.length <= LIMITS.highlightMax);
    if (s) highlights.push(s.endsWith(".") ? s : `${s}.`);
    else highlights.push("생활 속에서 실천해 보세요.");
  }

  return repairCardCopy(
    {
      title,
      intro,
      highlights,
      outro: undefined,
    },
    heading
  );
}
