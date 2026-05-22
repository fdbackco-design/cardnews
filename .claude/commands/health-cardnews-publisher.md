# health-cardnews-publisher

건강 정보 카드뉴스를 생성하고 Instagram에 게시하는 엔드-투-엔드 워크플로우.

## 사용법

```
/health-cardnews-publisher [주제]
```

`$ARGUMENTS`에 주제가 있으면 그대로 사용. 없으면 아래 절차에 따라 사용자에게 묻는다.

---

## 실행 절차

### Step 0 — 서버 확인

```bash
curl -s http://localhost:3000/api/cardnews/history | head -c 50
```

응답이 없으면(연결 거부) 사용자에게 `npm run web`으로 서버를 먼저 실행하라고 안내하고 중단.

### Step 1 — 입력 수집

`$ARGUMENTS`가 비어 있으면 사용자에게 다음을 순서대로 질문:

1. **주제** (필수) — 예: "당뇨병 예방법", "수면 부족의 위험성"
2. **대상 독자** (선택, 기본값: "일반 성인") — 예: "40~60대 중장년층", "청소년"
3. **카드 수** (선택, 기본값: 6) — 4~8 사이 정수
4. **톤앤매너** (선택, 기본값: "친근하고 이해하기 쉬운") — 예: "전문적", "캐주얼"
5. **참고 내용** (필수) — 주제와 관련된 의학적 사실, 통계, 주의사항 등 자유 입력. Gemini가 이 내용을 근거로 카드뉴스 본문을 작성함.

`$ARGUMENTS`에 주제가 있으면 1번은 건너뛰고 2~5번만 묻는다.

### Step 2 — 카드뉴스 생성 요청

아래 API를 호출해 생성 작업을 시작:

```bash
curl -s -X POST http://localhost:3000/api/cardnews/generate \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "custom-topic",
    "topic": "<주제>",
    "targetAudience": "<대상 독자>",
    "cardCount": <카드 수>,
    "tone": "<톤앤매너>",
    "referenceText": "<참고 내용>",
    "capture": true
  }'
```

응답에서 `jobId`를 추출.

### Step 3 — 생성 완료 대기 (폴링)

아래를 반복 (최대 20회, 15초 간격):

```bash
curl -s http://localhost:3000/api/cardnews/jobs/<jobId>
```

- `status === "done"` → 다음 단계 진행
- `status === "failed"` → 에러 메시지 출력 후 중단
- `status === "running"` → 현재 `stepLabel`을 사용자에게 표시하고 대기

### Step 4 — 완료된 세트 확인

```bash
curl -s http://localhost:3000/api/cardnews/jobs/<jobId>
```

응답의 `setId`를 추출. 생성된 카드 수와 제목을 사용자에게 표시.

### Step 5 — Instagram 초안 생성

```bash
curl -s -X POST http://localhost:3000/api/instagram/draft \
  -H "Content-Type: application/json" \
  -d '{"setId": "<setId>"}'
```

응답에서 `caption`과 `imagePaths`를 추출. 캡션을 사용자에게 보여주고 수정 여부를 확인:

- 수정하겠다면 → 사용자가 입력한 새 캡션으로 교체
- 그대로 사용하겠다면 → 원본 캡션 유지

### Step 6 — Instagram 업로드 확인

사용자에게 다음을 물어본 뒤 "예"일 때만 진행:

> "카드뉴스 N장을 Instagram에 게시할까요? (캡션 미리보기가 위에 표시됨)"

### Step 7 — Instagram 업로드

```bash
curl -s -X POST http://localhost:3000/api/instagram/upload \
  -H "Content-Type: application/json" \
  -d '{
    "setId": "<setId>",
    "caption": "<caption>",
    "imagePaths": <imagePaths JSON 배열>
  }'
```

- `status === "published"` → 성공 메시지와 `mediaId` 출력
- `status === "failed"` → 실패 단계(`failedStep`)와 에러 메시지 출력

---

## 출력 형식

완료 시 다음 형태로 요약:

```
✅ Instagram 게시 완료
  주제    : <주제>
  세트 ID : <setId>
  카드 수 : <N>장
  Media ID: <mediaId>
```

실패 시:
```
❌ 실패: <단계> — <에러 메시지>
```

---

## 주의사항

- Instagram 업로드는 R2 공개 URL 경유이므로 최대 약 1분 소요될 수 있음
- 카드뉴스 생성은 Gemini API 호출 포함으로 2~5분 소요될 수 있음
- 서버는 `npm run web`으로 미리 실행돼 있어야 함
- `.env`에 `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, R2 설정이 모두 있어야 함
