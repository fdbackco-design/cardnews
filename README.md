# TY Life Partners — 라이프 가이드 카드뉴스 생성기

질병관리청 국가건강정보포털의 건강 정보를 기반으로 1080×1350 인스타그램 카드뉴스를  
자동 생성하는 TypeScript 시스템.

---

## 전체 자동화 흐름

```
질병관리청 contentId
       ↓
  KDCA 스크레이퍼 (POST)
       ↓
  카드뉴스 기획 (planCardNews)
  ├─ 토픽 프리셋 (혈압 등)
  ├─ KDCA 원문 기반 변환
  └─ 범용 템플릿 fallback
       ↓
  이미지 검색 (Pexels API)
  └─ 실패 시 로컬 SVG fallback
       ↓
  HTML 렌더링 (1080×1350 × 카드 수)
       ↓
  Playwright PNG 캡처 (2x 고해상도)
       ↓
  output/{날짜-주제}/images/card-01.png …
```

---

## 폴더 구조

```
src/
├── config/brand.ts             # 브랜드 설정 (색상, 카드 크기, 출력 배율)
├── types/cardnews.ts           # 전체 타입 정의
├── data/sample-cardnews.ts     # 혈압 샘플 카드뉴스
├── services/
│   ├── kdcaScraper.ts          # 질병관리청 POST 스크레이퍼
│   ├── googleImageSearch.ts    # 이미지 공급자 라우터 (Pexels 기본, Google 선택)
│   └── instagramUploader.ts    # Instagram 업로드 placeholder
├── generator/
│   ├── planCardNews.ts         # 원문 → CardNewsSet 변환 로직
│   ├── renderHtml.ts           # CardNewsSet → HTML 렌더러
│   └── captureCards.ts         # Playwright PNG 캡처
├── templates/
│   └── cardnews.css            # 카드뉴스 디자인 토큰 + 레이아웃
├── utils/
│   ├── fs.ts                   # 폴더 생성, 파일 쓰기, slugify
│   └── text.ts                 # truncate, parseCliArgs
public/
└── assets/fallback.svg         # 이미지 검색 실패 시 사용할 배경
output/                         # 생성물 (gitignore 권장)
└── {날짜-주제}/
    ├── html/{id}.html
    └── images/card-01.png …
.env                            # 실제 API 키 (커밋 금지)
.env.example                    # 환경변수 템플릿
```

---

## 설치

```bash
git clone <repo>
cd cardnews
npm install
npx playwright install chromium
cp .env.example .env
```

---

## 환경변수 설정

`.env` 파일을 아래와 같이 작성합니다.

```env
# 이미지 공급자: pexels (기본값) | google
IMAGE_PROVIDER=pexels

# Pexels API 키 — https://www.pexels.com/api/ (무료, 월 200만 건)
PEXELS_API_KEY=your_pexels_api_key

# Google Custom Search (IMAGE_PROVIDER=google 로 변경 시 사용)
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_CX=

# 출력 폴더 (기본값: ./output)
OUTPUT_DIR=./output
```

> **API 키 없이도 실행 가능합니다.** 이미지 검색이 실패하면 `public/assets/fallback.svg`(다크 그라데이션)가 배경으로 사용됩니다.

---

## 실행 명령어

```bash
# HTML 생성만 (캡처 없음)
npm run generate

# HTML 생성 + PNG 캡처 한 번에
npm run all
npm run generate -- --capture

# 최근 생성된 HTML을 재캡처
npm run capture

# TypeScript 컴파일
npm run build

# Daily batch — 미처리 KDCA 글 1건 자동 생성 (HTML + PNG + registry)
npm run daily

# 다음 제작 대상만 확인 (생성·registry 기록 없음)
npm run daily:dry-run
```

처리 이력은 `data/processed-content.json`에 저장됩니다. 스케줄러 설정은 [docs/daily-scheduler.md](docs/daily-scheduler.md)를 참고하세요.

### 옵션 조합

```bash
# 특정 주제로 생성
npm run generate -- --topic="당뇨 관리"

# 질병관리청 contentId로 원문 가져오기 + 캡처
npm run generate -- --contentId=137 --topic="족저근막염" --capture

# 카드 수 지정 (6~8, 기본값 6)
npm run generate -- --topic="고혈압" --cardCount=8 --capture

# 리스트 패턴으로 생성
npm run generate -- --topic="운동 습관" --pattern=list --capture
```

---

## 질병관리청 contentId 사용 방법

1. [국가건강정보포털 이달의 건강정보](https://health.kdca.go.kr/healthinfo/biz/health/ntcnInfo/healthSourc/thtimtCntnts/thtimtCntntsMain.do) 접속
2. 원하는 콘텐츠 클릭
3. 브라우저 URL에서 `thtimt_cntnts_sn=` 뒤의 숫자 확인 → 이게 contentId
4. 아래 명령어 실행

```bash
npm run generate -- --contentId=<번호> --topic="<주제명>" --capture
```

> `topic`은 카드뉴스 제목에 사용됩니다. contentId의 원문 제목과 달라도 됩니다.

---

## 다음 카드뉴스를 만들 때 수정할 파일

### 가장 빠른 방법 — 명령어만 바꾸기

```bash
npm run generate -- --contentId=<새 ID> --topic="<새 주제>" --capture
```

별도 코드 수정 없이 새 주제로 카드뉴스가 생성됩니다.

---

### 디자인을 바꾸고 싶을 때

**`src/templates/cardnews.css`**
- 색상: `--brand-orange`, `--brand-orange-light` 변수 수정
- 폰트 크기: `.card__title`, `.card__intro` 등 `font-size` 수정
- 레이아웃: 표지/내용 카드 패딩, 정렬 방향 수정

---

### 특정 주제 전용 카드를 직접 작성하고 싶을 때

**`src/generator/planCardNews.ts`**

1. `buildBloodPressureNarrative` 함수를 참고해 새 함수 작성
2. `NARRATIVE_TOPIC_BUILDERS` 맵에 키워드 → 함수 등록

```typescript
// 예시: 당뇨 전용 카드
function buildDiabetesNarrative(options: PlanCardNewsOptions): CardNewsSet { ... }

const NARRATIVE_TOPIC_BUILDERS: Record<string, TopicBuilder> = {
  혈압: buildBloodPressureNarrative,
  당뇨: buildDiabetesNarrative,   // ← 추가
};
```

---

### 샘플 데이터를 바꾸고 싶을 때

**`src/data/sample-cardnews.ts`** — `npm run generate`의 기본 출력 주제를 변경

---

## 이미지 공급자 설정

### Pexels (기본)

```env
IMAGE_PROVIDER=pexels
PEXELS_API_KEY=your_key
```

- 무료, 월 200만 건
- 발급: [pexels.com/api](https://www.pexels.com/api/)
- portrait(세로형) 이미지 우선 검색

### Google Custom Search (선택)

```env
IMAGE_PROVIDER=google
GOOGLE_CSE_API_KEY=your_key
GOOGLE_CSE_CX=your_cx_id
```

- 무료 100건/일
- [Google Cloud Console](https://console.cloud.google.com/)에서 **Custom Search API** 활성화 필수
- [Programmable Search Engine](https://programmablesearchengine.google.com/)에서 CX 발급

### Fallback 이미지

API 키가 없거나 검색이 실패하면 `public/assets/fallback.svg`(다크 그라데이션)가 자동 사용됩니다.  
이 파일을 원하는 배경 이미지로 교체하면 커스텀 fallback으로 동작합니다.

---

## 출력 파일 위치

```
output/
└── {YYYYMMDD}-{주제}/
    ├── html/
    │   └── {id}.html          # 전체 카드 HTML (브라우저에서 미리보기 가능)
    └── images/
        ├── card-01.png        # 표지 (2160×2700px, 인스타그램 업로드용)
        ├── card-02.png
        └── …
```

---

## 인스타그램 업로드 확장 방향

`src/services/instagramUploader.ts`에 placeholder 함수가 있습니다.  
Meta Graph API를 사용하는 실제 업로드는 아래 흐름으로 구현할 수 있습니다.

```
PNG 파일 → 공개 URL 업로드 (S3/CDN)
         → Graph API /me/media 로 미디어 생성
         → Graph API /me/media_publish 로 게시
```

필요한 환경변수는 `.env`의 `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`에 추가하면 됩니다.

---

## 자주 발생하는 오류

| 오류 | 원인 | 해결 |
|---|---|---|
| `Executable doesn't exist` | Playwright 브라우저 미설치 | `npx playwright install chromium` |
| `PEXELS_API_KEY 미설정` | .env에 키 없음 | fallback으로 자동 진행, 키 입력 시 해소 |
| `API_KEY_SERVICE_BLOCKED` | Google Cloud에서 Custom Search API 미활성화 | GCP Console에서 API 활성화 |
| KDCA 수집 실패 | 네트워크 오류 또는 URL 변경 | 프리셋/템플릿으로 자동 전환, 재시도 |
| HTML 저장 실패 | output 폴더 권한 문제 | `chmod 755 output` |
| `rawText` 22자만 반환 | KDCA form 태그 제거 버그 | `kdcaScraper.ts`에서 NOISE_SELECTORS에 `form` 미포함 확인 |

---

## 카드뉴스 디자인 스펙

| 항목 | 값 |
|---|---|
| 카드 크기 | 1080 × 1350px (4:5) |
| 출력 해상도 | 2160 × 2700px (2x) |
| 구성 | 표지 1장 + 내용 5~7장 |
| 주 컬러 | `#FF6B3D` |
| 라벨 폰트 | BMKkubulim (배달의민족 꾸불림체) |
| 본문 폰트 | Pretendard |

---

## 콘텐츠 원칙

- 건강 정보는 질병관리청 출처 기반으로 보수적으로 작성합니다.
- 원문에 없는 치료 효과, 예방 효과, 진단 표현은 추가하지 않습니다.
- "반드시", "완치", "예방된다" 같은 단정 표현은 사용하지 않습니다.

---

## 현재 제한사항 및 개선 포인트

| 항목 | 현황 | 개선 방향 |
|---|---|---|
| 이미지 검색 | query 영문 고정 | 한국어 query 또는 Unsplash API 추가 |
| 카드 문구 | rule-based 생성 | Gemini API로 문맥 맞춤 문구 생성 |
| 인스타그램 | placeholder | Graph API 실제 연동 |
| 이미지 품질 | Pexels portrait 800px | 원본(original) URL 사용 또는 Imagen 4 생성 |
| 배치 처리 | 단일 주제 | 여러 contentId 일괄 처리 스크립트 추가 |
| 캐시 | 없음 | 동일 query 결과 로컬 캐시로 API 절약 |
