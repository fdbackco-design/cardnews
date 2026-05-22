FROM node:20-bookworm-slim

# ── 시스템 의존성 ─────────────────────────────────────────────────────────────
# fonts-noto-cjk: 한글 폰트 렌더링 (Playwright 캡처 시 글자 깨짐 방지)
# Playwright Chromium 의존성은 아래 `playwright install --with-deps`가 처리
RUN apt-get update && apt-get install -y \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Node 의존성 설치 (소스 복사 전에 레이어 캐시 활용) ───────────────────────
COPY package*.json ./
RUN npm ci

# ── Playwright Chromium 설치 (시스템 의존성 포함) ─────────────────────────────
RUN npx playwright install --with-deps chromium

# ── 소스 복사 + 빌드 ──────────────────────────────────────────────────────────
COPY . .
RUN npm run build

EXPOSE 3000

# ── 실행 방식: node dist/web/server.js (컴파일된 JS 직접 실행) ───────────────
# postbuild 스크립트가 src/web/public → dist/web/public 으로 복사하므로
# __dirname 기준 정적 파일 서빙이 정상 동작한다.
CMD ["node", "dist/web/server.js"]
