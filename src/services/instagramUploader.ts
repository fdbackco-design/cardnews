import { CardNewsOutput } from "../types/cardnews";

// Instagram 업로드 placeholder — 추후 Meta Graph API 연동 예정
export async function uploadToInstagram(
  output: CardNewsOutput,
  caption: string
): Promise<void> {
  console.log("[InstagramUploader] 업로드 기능은 아직 구현되지 않았습니다.");
  console.log("[InstagramUploader] 대상 이미지:", output.imagePaths);
  console.log("[InstagramUploader] 캡션 미리보기:", caption.slice(0, 60) + "…");
  // TODO: Meta Graph API 캐러셀 업로드 구현
  //   1. 각 이미지를 Media Object로 업로드 → media_id 수집
  //   2. Carousel Container 생성
  //   3. 게시 (publish)
}

export function buildCaption(title: string, sourceUrl?: string): string {
  const lines = [
    `✅ ${title}`,
    "",
    "#라이프가이드 #TYLifePartners #건강정보 #혈압",
  ];
  if (sourceUrl) {
    lines.push("", `출처: ${sourceUrl}`);
  }
  return lines.join("\n");
}
