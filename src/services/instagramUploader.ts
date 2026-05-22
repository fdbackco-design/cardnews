import { CardNewsOutput } from "../types/cardnews";

export type InstagramUploadStatus = "ready" | "placeholder-uploaded" | "failed";

export type InstagramUploadResult = {
  status: InstagramUploadStatus;
  message: string;
  imageCount: number;
};

/**
 * Instagram 업로드 placeholder — 추후 Meta Graph API 연동 예정.
 *
 * 현재는 실제 업로드 대신 다음 정보를 로그로 남기고 placeholder 상태를 반환한다.
 *   - 이미지 경로 목록
 *   - 캡션 미리보기
 *   - 선택된 이미지 수
 *   - status: placeholder-uploaded
 */
export async function uploadToInstagram(
  output: CardNewsOutput,
  caption: string
): Promise<InstagramUploadResult> {
  console.log("[InstagramUploader] 업로드 기능은 아직 구현되지 않았습니다.");
  console.log(`[InstagramUploader] 이미지 ${output.imagePaths.length}장`);
  console.log("[InstagramUploader] 대상 이미지:", output.imagePaths);
  console.log("[InstagramUploader] 캡션 미리보기:", caption.slice(0, 60) + "…");
  console.log("[InstagramUploader] status: placeholder-uploaded");

  // TODO: Meta Graph API 캐러셀 업로드 구현
  //   1. 각 이미지를 Media Object로 업로드 → media_id 수집
  //   2. Carousel Container 생성
  //   3. 게시 (publish)

  return {
    status: "placeholder-uploaded",
    message: "Instagram upload is not implemented yet.",
    imageCount: output.imagePaths.length,
  };
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
