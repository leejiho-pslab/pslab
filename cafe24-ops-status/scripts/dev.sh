#!/usr/bin/env bash
# 로컬 개발 — API(8000) + 대시보드(5173) 동시 실행. Ctrl+C 로 종료.
set -e
cd "$(dirname "$0")/.."

# 데이터가 없으면 mock 30일 적재
python scripts/run_all.py --days 30 >/dev/null 2>&1 || true

uvicorn api.main:app --reload --port 8000 &
API=$!

( cd dashboard && npm install --silent && npm run dev ) &
WEB=$!

trap 'kill $API $WEB 2>/dev/null' EXIT INT TERM
echo "API   → http://localhost:8000"
echo "WEB   → http://localhost:5173  (/api 는 8000 으로 프록시)"
wait
