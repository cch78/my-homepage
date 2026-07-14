#!/bin/bash
# 주간 리뷰 크롤링 + 변경 시 자동 배포 (launchd가 매주 일요일 09:00 실행)
# 수동 실행: bash crawler/run-weekly.sh

set -u
cd "$(dirname "$0")/.." || exit 1

LOG="crawler/crawl-log.txt"
echo "" >> "$LOG"
echo "===== $(date '+%Y-%m-%d %H:%M:%S') 주간 리뷰 크롤링 시작 =====" >> "$LOG"

# Node 경로 (launchd는 PATH가 제한적)
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

node crawler/crawl-reviews.js >> "$LOG" 2>&1
CRAWL_EXIT=$?

if [ $CRAWL_EXIT -ne 0 ]; then
  echo "크롤러 실패 (exit $CRAWL_EXIT) — 배포 생략" >> "$LOG"
  exit $CRAWL_EXIT
fi

# reviews.json이 실제로 바뀐 경우에만 커밋·푸시
if git diff --quiet -- data/reviews.json; then
  echo "새 리뷰 없음 — 배포 생략" >> "$LOG"
  exit 0
fi

git add data/reviews.json
git commit -m "chore: 리뷰 데이터 자동 갱신 ($(date '+%Y-%m-%d'))" >> "$LOG" 2>&1
git push origin main >> "$LOG" 2>&1
if [ $? -eq 0 ]; then
  echo "새 리뷰 반영 완료 — GitHub Pages 자동 배포됨" >> "$LOG"
else
  echo "⚠️ git push 실패 — 네트워크/인증 확인 필요" >> "$LOG"
fi
