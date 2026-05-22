# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # TypeScript 컴파일 (dist/ 출력)
npm run web            # 관리 웹앱 개발 서버 (포트 3000, tsx watch)
npm run generate       # CLI: HTML 카드뉴스 생성
npm run generate -- --capture   # CLI: HTML + PNG 캡처
npm run generate -- --contentId=137 --topic="족저근막염" --capture
npm run daily          # 미처리 KDCA 글 1건 자동 배치 처리
npm run daily:dry-run  # 다음 대상 확인만 (부작용 없음)
npm run kdca:list      # KDCA 목록 스크레이퍼 직접 실행
```

테스트 프레임워크 없음. 빌드(`npm run build`)로 타입 오류 검증.

Playwright 브라우저 미설치 시: `npx playwright install chromium`

---

## 전체 아키텍처

크게 두 실행 경로가 있다: **CLI 파이프라인**과 **웹앱**.

### CLI 파이프라인 (`src/pipeline/runCardNewsPipeline.ts`)

```
CLI(src/index.ts) / daily batch
  → runCardNewsPipeline()
      1. KDCA 스크레이퍼 (keyword → listScraper → contentId → kdcaScraper)
      2. planCardNewsAsync()   → CardNewsSet
      3. enrichCardNewsImages() → 이미지 URL 주입
      4. renderCardNewsHtml()  → HTML 파일
      5. captureCardsFromHtml() → PNG 파일 (Playwright)
  → output/{날짜-주제}/
```

### 웹앱 (`src/web/`)

Express 5 서버. API와 SPA를 함께 서빙.

```
server.ts
  ├── /api/cardnews  → cardNewsRoutes.ts
  │     └── jobManager.ts (in-memory job store)
  │           → 동일한 5단계 파이프라인을 비동기 job으로 실행
  └── /api/instagram → instagramRoutes.ts
        ├── GET  /config   → 설정 상태 반환
        ├── POST /draft    → instagramDraft.ts (caption 생성)
        └── POST /upload   → publicAssetUploader(R2) → instagramPublisher(Graph API)
```

프론트엔드: `src/web/public/`의 순수 HTML/JS/CSS (빌드 도구 없음). 해시 기반 라우팅(`#list`, `#detail`, `#instagram`)으로 div를 show/hide.

---

## 핵심 타입 (`src/types/cardnews.ts`)

- **`CardNewsSet`** — 전체 카드뉴스 세트 (표지 1장 + 내용 카드 N장)
- **`CoverCard`** — `titleLines[]`, `subtitle?`, `imageQuery`
- **`ContentCard`** — `title`, `subtitle?`, `intro`, `highlights[]`, `outro?`, `imageQuery`
- **`KdcaContent`** — KDCA 원문 (`contentId`, `sections[]`, `rawText`, `sourceHtml?`)

`deck.json` — 각 세트의 `output/{setId}/deck.json`에 `CardNewsSet` 직렬화본 저장.

---

## 콘텐츠 생성 (`src/services/content/`)

두 가지 생성 모드:

1. **KDCA 원문 기반** (`generateCardNewsFromSource`): KDCA HTML → Gemini → `CardNewsSet`
2. **직접 주제 입력** (`generateCardNewsFromTopic`): 사용자 제공 topic + referenceText → 2단계 Gemini (①건강 기사 `sourceArticle` 생성 → ②카드 추출) → `CardNewsSet`

두 경우 모두 `GEMINI_API_KEY`가 없거나 `CONTENT_GENERATOR=off`이면 rule-based fallback 사용.

LLM 호출 시 JSON 스키마(`CARD_DECK_RESPONSE_SCHEMA` / `TOPIC_GENERATE_RESPONSE_SCHEMA`)를 Gemini에 전달해 구조화된 응답을 강제한다. 중복/금지 문구 검출 시 최대 3회 재시도(`validateTopicDeckUniqueness`).

`CONTENT_GENERATOR_MODEL` 환경변수로 모델 지정 (기본: `gemini-2.5-flash`).

---

## 이미지 공급자 (`src/services/image/`)

`IMAGE_PROVIDER` 환경변수로 제어:

| 값 | 동작 |
|---|---|
| `hybrid` (기본) | Gemini 이미지 생성 시도 → 실패 시 Pexels |
| `pexels` | Pexels API만 사용 |
| `gemini` | Gemini Imagen만 사용 |
| `local` | 로컬 fallback SVG만 사용 |

`FORCE_REGENERATE_IMAGES=true` 환경변수로 기존 이미지 무시하고 재생성.

진입점은 `enrichCardNewsImages(deck)` → 내부에서 `resolveCardImage()`가 카드별로 공급자 선택.

---

## KDCA 스크레이퍼 (`src/services/kdcaScraper.ts`)

KDCA는 GET이 아니라 **POST** 요청으로 콘텐츠를 반환한다. `contentId`(`thtimt_cntnts_sn`)를 form body에 담아야 함. cheerio로 `.board-contents` 루트를 파싱. `NOISE_SELECTORS`에 `form`을 포함하지 말 것 — 제거하면 rawText가 22자로 짧아지는 버그 발생.

---

## Instagram 업로드 흐름

```
POST /api/instagram/upload
  → publicAssetUploader.ts (R2Uploader)
      - 로컬 PNG → Cloudflare R2 (S3 호환, @aws-sdk/client-s3)
      - 키: cardnews/{setId}/{filename}
      - 공개 URL: encodeURIComponent 퍼센트 인코딩 필수 (setId에 한글 포함)
  → instagramPublisher.ts
      Step 1: POST /{igUserId}/media (is_carousel_item=true) × N장
      Step 2: POST /{igUserId}/media (CAROUSEL 컨테이너)
      Step 3: GET /{containerId}?fields=status_code 폴링 → FINISHED 대기
      Step 4: POST /{igUserId}/media_publish
```

R2 엔드포인트: `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com` — `R2_ACCOUNT_ID`는 Cloudflare 대시보드의 hex Account ID여야 함(이메일 주소 아님).

---

## 출력 디렉터리 구조

```
output/{YYYYMMDD}-{주제}/
  ├── deck.json          # CardNewsSet 직렬화본 (웹앱 편집·재렌더링 기준)
  ├── {id}.html          # 렌더링된 카드뉴스 HTML
  ├── images/
  │   ├── card-01.png    # 2160×2700px (2x)
  │   └── …
  └── instagram-upload-log.json  # 업로드 성공/실패 이력
```

---

## 환경변수 요약

필수:
- `GEMINI_API_KEY` — LLM 재작성 및 이미지 생성
- `PEXELS_API_KEY` — Pexels 이미지 검색

Instagram 업로드 시 추가 필요:
- `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `PUBLIC_ASSET_PROVIDER=r2`
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`

전체 변수 목록은 `.env.example` 참고.

---

## 카드뉴스 디자인

카드 크기: 1080×1350px (4:5), 출력: 2160×2700px (2x scale). 색상·폰트·레이아웃 변경은 `src/templates/cardnews.css`. 브랜드 상수(색상, 크기 등)는 `src/config/brand.ts`.
