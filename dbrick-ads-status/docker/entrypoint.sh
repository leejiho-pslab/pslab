#!/bin/sh
set -e

# mock 모드면 비어있을 때 최근 30일 샘플을 적재해 바로 화면이 보이도록 한다.
if [ "${CAFE24_OPS_MODE:-mock}" = "mock" ]; then
  python scripts/run_all.py --days 30 --quiet || true
fi

exec uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
