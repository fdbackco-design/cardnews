# Daily 카드뉴스 스케줄러 설정

매일 오전 10시에 미처리 KDCA 글 1건을 자동 생성하려면 OS 스케줄러에서 `npm run daily`를 실행합니다.

## 사전 준비

```bash
cd /path/to/cardnews
npm install
npx playwright install chromium
cp .env.example .env
# GEMINI_API_KEY, PEXELS_API_KEY 등 설정
```

## macOS (launchd)

`~/Library/LaunchAgents/com.tylife.cardnews.daily.plist` 예시:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tylife.cardnews.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/you/cardnews && npm run daily >> logs/daily.log 2>&1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>10</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/you/cardnews/logs/daily.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/you/cardnews/logs/daily.stderr.log</string>
</dict>
</plist>
```

```bash
mkdir -p logs
launchctl load ~/Library/LaunchAgents/com.tylife.cardnews.daily.plist
```

## Linux (cron)

```cron
0 10 * * * cd /path/to/cardnews && /usr/bin/npm run daily >> logs/daily.log 2>&1
```

## 수동 확인

```bash
# 다음 제작 대상만 확인 (생성·registry 기록 없음)
npm run daily:dry-run

# 실제 1건 생성
npm run daily
```

## 처리 이력

- `data/processed-content.json` — 처리 완료 `contentId` 목록
- `output/{날짜-주제}/batch-report.json` — 이미지 provider·적합성 감사
