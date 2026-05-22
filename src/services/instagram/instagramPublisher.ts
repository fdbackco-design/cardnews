/**
 * Instagram Graph API Carousel Publisher
 *
 * Flow (Meta Graph API v25.0):
 *   Step 1: 각 이미지마다 POST /{ig-user-id}/media (is_carousel_item=true, image_url)
 *           → child creation_id 수집
 *   Step 2: POST /{ig-user-id}/media (media_type=CAROUSEL, children=[...], caption)
 *           → 컨테이너 creation_id 수집
 *   Step 3: POST /{ig-user-id}/media_publish (creation_id=컨테이너)
 *           → 최종 게시. id 반환 (= 게시된 미디어 ID)
 *
 * 모든 실패는 process를 죽이지 않는다. 어느 단계에서 실패했는지 식별 가능한
 * 구조화된 객체를 반환한다.
 */

export type PublishStep = "validate" | "child-create" | "container-create" | "container-ready" | "publish";

export type PublishStepResult = {
  step: PublishStep;
  ok: boolean;
  message?: string;
  data?: unknown;
};

export type PublishSuccess = {
  success: true;
  mediaId: string;
  containerId: string;
  childIds: string[];
  steps: PublishStepResult[];
};

export type PublishFailure = {
  success: false;
  failedStep: PublishStep;
  error: string;
  steps: PublishStepResult[];
};

export type PublishResult = PublishSuccess | PublishFailure;

export type PublishParams = {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
};

// ── 진입점 ───────────────────────────────────────────────────────────────────

export async function publishInstagramCarousel(
  params: PublishParams
): Promise<PublishResult> {
  const steps: PublishStepResult[] = [];

  // Step 0: 입력 검증
  const validation = validateParams(params);
  steps.push(validation);
  if (!validation.ok) {
    return {
      success: false,
      failedStep: "validate",
      error: validation.message ?? "입력 검증 실패",
      steps,
    };
  }

  const apiVersion = (process.env["META_GRAPH_API_VERSION"] ?? "v25.0").trim();
  const baseUrl = `https://graph.facebook.com/${apiVersion}`;
  const { igUserId, accessToken, caption, imageUrls } = params;

  // Step 1: 각 이미지마다 child media 생성
  const childIds: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i]!;
    const r = await createChildMedia({
      baseUrl,
      igUserId,
      accessToken,
      imageUrl,
      orderIndex: i,
    });
    steps.push(r.step);
    if (!r.creationId) {
      return {
        success: false,
        failedStep: "child-create",
        error: r.step.message ?? `child media 생성 실패 (이미지 #${i + 1})`,
        steps,
      };
    }
    childIds.push(r.creationId);
  }

  // Step 2: Carousel 컨테이너 생성
  const container = await createCarouselContainer({
    baseUrl,
    igUserId,
    accessToken,
    caption,
    childIds,
  });
  steps.push(container.step);
  if (!container.creationId) {
    return {
      success: false,
      failedStep: "container-create",
      error: container.step.message ?? "Carousel 컨테이너 생성 실패",
      steps,
    };
  }

  // Step 3: 컨테이너 처리 완료 대기 (FINISHED 폴링)
  const ready = await waitForContainerReady({
    baseUrl,
    accessToken,
    containerId: container.creationId,
  });
  steps.push(ready.step);
  if (!ready.ok) {
    return {
      success: false,
      failedStep: "container-ready",
      error: ready.step.message ?? "컨테이너 처리 시간 초과",
      steps,
    };
  }

  // Step 4: 게시
  const publish = await publishContainer({
    baseUrl,
    igUserId,
    accessToken,
    containerId: container.creationId,
  });
  steps.push(publish.step);
  if (!publish.mediaId) {
    return {
      success: false,
      failedStep: "publish",
      error: publish.step.message ?? "media_publish 호출 실패",
      steps,
    };
  }

  return {
    success: true,
    mediaId: publish.mediaId,
    containerId: container.creationId,
    childIds,
    steps,
  };
}

// ── Step Implementations ─────────────────────────────────────────────────────

function validateParams(params: PublishParams): PublishStepResult {
  const { igUserId, accessToken, caption, imageUrls } = params;
  if (!igUserId) {
    return { step: "validate", ok: false, message: "igUserId(INSTAGRAM_BUSINESS_ACCOUNT_ID)가 비어 있습니다." };
  }
  if (!accessToken) {
    return { step: "validate", ok: false, message: "accessToken(INSTAGRAM_ACCESS_TOKEN)가 비어 있습니다." };
  }
  if (!imageUrls?.length) {
    return { step: "validate", ok: false, message: "imageUrls가 비어 있습니다." };
  }
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    return {
      step: "validate",
      ok: false,
      message: `Carousel은 2~10장만 허용됩니다 (현재 ${imageUrls.length}장).`,
    };
  }
  for (let i = 0; i < imageUrls.length; i++) {
    const u = imageUrls[i] ?? "";
    if (!/^https:\/\//i.test(u)) {
      return {
        step: "validate",
        ok: false,
        message: `imageUrls[${i}]가 HTTPS URL이 아닙니다: "${u.slice(0, 80)}"`,
      };
    }
  }
  if (typeof caption !== "string") {
    return { step: "validate", ok: false, message: "caption은 문자열이어야 합니다." };
  }
  return { step: "validate", ok: true, message: "입력 검증 통과" };
}

async function createChildMedia(args: {
  baseUrl: string;
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  orderIndex: number;
}): Promise<{ creationId: string | null; step: PublishStepResult }> {
  const { baseUrl, igUserId, accessToken, imageUrl, orderIndex } = args;
  const url = `${baseUrl}/${encodeURIComponent(igUserId)}/media`;

  const form = new URLSearchParams();
  form.set("image_url", imageUrl);
  form.set("is_carousel_item", "true");
  form.set("access_token", accessToken);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = (await safeJson(res)) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      return {
        creationId: null,
        step: {
          step: "child-create",
          ok: false,
          message: `[#${orderIndex + 1}] child media 생성 실패: ${
            json.error?.message ?? `HTTP ${res.status}`
          }`,
          data: json,
        },
      };
    }
    return {
      creationId: json.id,
      step: {
        step: "child-create",
        ok: true,
        message: `[#${orderIndex + 1}] child creation_id=${json.id}`,
      },
    };
  } catch (err) {
    return {
      creationId: null,
      step: {
        step: "child-create",
        ok: false,
        message: `[#${orderIndex + 1}] 네트워크 오류: ${asMessage(err)}`,
      },
    };
  }
}

async function createCarouselContainer(args: {
  baseUrl: string;
  igUserId: string;
  accessToken: string;
  caption: string;
  childIds: string[];
}): Promise<{ creationId: string | null; step: PublishStepResult }> {
  const { baseUrl, igUserId, accessToken, caption, childIds } = args;
  const url = `${baseUrl}/${encodeURIComponent(igUserId)}/media`;

  const form = new URLSearchParams();
  form.set("media_type", "CAROUSEL");
  form.set("children", childIds.join(","));
  form.set("caption", caption);
  form.set("access_token", accessToken);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = (await safeJson(res)) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      return {
        creationId: null,
        step: {
          step: "container-create",
          ok: false,
          message: `컨테이너 생성 실패: ${json.error?.message ?? `HTTP ${res.status}`}`,
          data: json,
        },
      };
    }
    return {
      creationId: json.id,
      step: { step: "container-create", ok: true, message: `container_id=${json.id}` },
    };
  } catch (err) {
    return {
      creationId: null,
      step: {
        step: "container-create",
        ok: false,
        message: `네트워크 오류: ${asMessage(err)}`,
      },
    };
  }
}

async function waitForContainerReady(args: {
  baseUrl: string;
  accessToken: string;
  containerId: string;
  maxAttempts?: number;
  intervalMs?: number;
}): Promise<{ ok: boolean; step: PublishStepResult }> {
  const { baseUrl, accessToken, containerId, maxAttempts = 15, intervalMs = 3000 } = args;
  const url = `${baseUrl}/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      const json = (await safeJson(res)) as { status_code?: string; error?: { message?: string } };

      if (!res.ok) {
        return {
          ok: false,
          step: {
            step: "container-ready",
            ok: false,
            message: `컨테이너 상태 조회 실패: ${json.error?.message ?? `HTTP ${res.status}`}`,
          },
        };
      }

      const code = json.status_code ?? "";
      console.log(`[Instagram] 컨테이너 상태 (${attempt}/${maxAttempts}): ${code}`);

      if (code === "FINISHED") {
        return { ok: true, step: { step: "container-ready", ok: true, message: `FINISHED (${attempt}회 시도)` } };
      }
      if (code === "ERROR" || code === "EXPIRED") {
        return {
          ok: false,
          step: { step: "container-ready", ok: false, message: `컨테이너 처리 오류: status_code=${code}` },
        };
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
      return {
        ok: false,
        step: { step: "container-ready", ok: false, message: `네트워크 오류: ${asMessage(err)}` },
      };
    }
  }

  return {
    ok: false,
    step: { step: "container-ready", ok: false, message: `컨테이너 처리 시간 초과 (${maxAttempts}회 × ${intervalMs}ms)` },
  };
}

async function publishContainer(args: {
  baseUrl: string;
  igUserId: string;
  accessToken: string;
  containerId: string;
}): Promise<{ mediaId: string | null; step: PublishStepResult }> {
  const { baseUrl, igUserId, accessToken, containerId } = args;
  const url = `${baseUrl}/${encodeURIComponent(igUserId)}/media_publish`;

  const form = new URLSearchParams();
  form.set("creation_id", containerId);
  form.set("access_token", accessToken);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const json = (await safeJson(res)) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      return {
        mediaId: null,
        step: {
          step: "publish",
          ok: false,
          message: `media_publish 실패: ${json.error?.message ?? `HTTP ${res.status}`}`,
          data: json,
        },
      };
    }
    return {
      mediaId: json.id,
      step: { step: "publish", ok: true, message: `media_id=${json.id}` },
    };
  } catch (err) {
    return {
      mediaId: null,
      step: {
        step: "publish",
        ok: false,
        message: `네트워크 오류: ${asMessage(err)}`,
      },
    };
  }
}

// ── 유틸 ────────────────────────────────────────────────────────────────────

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return { __nonJson: await res.text() };
    } catch {
      return {};
    }
  }
}

function asMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
