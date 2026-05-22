# Synology DS224+ NAS 배포 가이드

Synology DS224+ (DSM 7.2) + Container Manager 기준.

**접속 주소:** `http://NAS-IP:3100`

> 내부 포트 3000은 NAS에서 이미 다른 서비스가 사용 중일 수 있으므로 이 프로젝트는 외부 포트 **3100**을 사용한다.
> `.env`의 `WEB_PORT`는 컨테이너 내부 값(3000)이며, 실제 외부 접속 포트(3100)와 다르다.

---

## 실행 방식

Docker 이미지는 `npm run build`로 TypeScript를 컴파일한 뒤 **`node dist/web/server.js`** 로 실행된다. `tsx` 없이 컴파일된 JS를 직접 실행하므로 메모리 효율이 좋고 시작 속도가 빠르다.

---

## 1. 사전 준비

### 1-1. DSM 패키지 설치 확인
- DSM 7.2 이상
- **패키지 센터 → Container Manager** 설치

### 1-2. NAS에 프로젝트 폴더 생성

SSH 또는 File Station에서:

```
/volume1/docker/cardnews/
```

### 1-3. 프로젝트 파일 업로드

**방법 A — SSH git clone:**
```bash
ssh admin@NAS-IP
cd /volume1/docker
git clone <repo-url> cardnews
```

**방법 B — File Station:**
로컬에서 zip으로 압축 후 File Station으로 업로드, `/volume1/docker/cardnews/`에 압축 해제.

### 1-4. 서브 디렉터리 생성

```bash
cd /volume1/docker/cardnews
mkdir -p output data logs
```

### 1-5. .env 파일 작성

```bash
cp .env.example .env
nano .env   # 또는 vi .env
```

**NAS 배포 시 반드시 변경할 항목:**

```env
OUTPUT_DIR=/app/output

GEMINI_API_KEY=<발급한 키>
PEXELS_API_KEY=<발급한 키>

INSTAGRAM_ACCESS_TOKEN=<토큰>
INSTAGRAM_BUSINESS_ACCOUNT_ID=<ID>
PUBLIC_ASSET_PROVIDER=r2
R2_ACCOUNT_ID=<Cloudflare Account ID (hex)>
R2_ACCESS_KEY_ID=<키>
R2_SECRET_ACCESS_KEY=<시크릿>
R2_BUCKET=<버킷명>
R2_PUBLIC_BASE_URL=<공개 URL>
```

### 1-6. 폰트 파일 배치

`public/fonts/` 폴더에 폰트 파일을 넣는다. 없으면 카드 캡처 시 기본 시스템 폰트로 대체된다.

```
/volume1/docker/cardnews/public/fonts/
  ├── Pretendard-Bold.otf
  ├── Pretendard-Medium.otf
  └── BMKkubulimTTF.ttf
```

---

## 2. Container Manager GUI로 배포 (권장)

1. DSM 접속 → **Container Manager** 실행
2. 왼쪽 메뉴 **프로젝트** 선택
3. **생성** 클릭
4. 설정:
   - **프로젝트 이름:** `cardnews`
   - **경로:** `/volume1/docker/cardnews`
   - **소스:** `docker-compose.yml 사용` 선택
5. **다음** → 내용 확인 후 **완료**
6. 빌드가 시작된다. 최초 빌드는 Playwright Chromium 다운로드 때문에 5~10분 소요.
7. 빌드 완료 후 **컨테이너** 탭에서 `cardnews-web` 상태가 **실행 중**인지 확인.
8. 브라우저에서 `http://NAS-IP:3100` 접속 확인.

---

## 3. SSH로 배포

```bash
ssh admin@NAS-IP
cd /volume1/docker/cardnews
docker compose up -d --build
```

> Synology DSM에서 `docker compose` 명령이 없을 수 있다. 이 경우 위 **2번 Container Manager GUI** 방식을 사용한다.

---

## 4. 접속 주소

```
http://NAS-IP:3100
```

---

## 5. 로그 확인

**GUI:**
Container Manager → 컨테이너 → `cardnews-web` → **로그** 탭

**SSH:**
```bash
docker logs -f cardnews-web
```

---

## 6. 컨테이너 재시작

**GUI:**
Container Manager → 컨테이너 → `cardnews-web` → **재시작**

**SSH:**
```bash
docker compose restart
```

---

## 7. 코드 업데이트 후 재배포

**GUI 방식:**
1. File Station 또는 SSH로 새 코드 업로드 (또는 `git pull`)
2. Container Manager → 프로젝트 → `cardnews` → **빌드** 클릭

**SSH 방식:**
```bash
cd /volume1/docker/cardnews
git pull
docker compose up -d --build
```

---

## 8. 데이터 백업

Hyper Backup 대상으로 아래 폴더를 지정한다:

| 폴더 | 내용 |
|---|---|
| `output/` | 생성된 카드뉴스 HTML/PNG |
| `data/` | KDCA 처리 이력 (`processed-content.json`) |
| `logs/` | 실행 로그 |

`.env`는 별도 안전한 위치에 백업한다.

---

## 9. 보안 주의사항

- `.env`는 절대 GitHub에 올리지 않는다. `.gitignore`에 포함돼 있으나 재확인할 것.
- API 키가 GitHub에 이미 올라간 적이 있다면 즉시 재발급.
- 최초 테스트는 사내망(또는 VPN)에서만 접속할 것.
- 외부 공개가 필요한 경우 Synology **리버스 프록시** 또는 **Cloudflare Tunnel** 사용.

---

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 빌드 중단, Chromium 다운로드 실패 | NAS 인터넷 차단 | DSM 방화벽 규칙 확인 |
| 카드 캡처 실패 | Playwright 메모리 부족 | `docker-compose.yml`에서 `mem_limit: 4g`로 상향 |
| 한글 글자 깨짐 | 컨테이너 내 한글 폰트 없음 | `fonts-noto-cjk`는 이미지에 포함됨 — 로그 확인 |
| 폰트 미적용 | `public/fonts/` 파일 없음 | `1-6. 폰트 파일 배치` 단계 확인 |
| 3100 포트 접속 불가 | DSM 방화벽 차단 | DSM → 제어판 → 보안 → 방화벽 → 3100 허용 |
| `docker compose` 명령 없음 | DSM 버전 이슈 | Container Manager GUI 방식 사용 |
