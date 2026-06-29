#!/usr/bin/env python3
"""이어받기(resumable) · 시간예산(time-budgeted) 백필.

한 번 실행에 최대 --budget-min 분만 수집하고, 마지막으로 끝낸 날짜를 DB(app_kv)의
'backfill_cursor' 에 저장한다. 다음 실행은 그 다음 날부터 이어받는다.
→ 아무리 긴 기간이라도 GitHub 2시간 제한에 안 걸리고, 빠진 날짜를 자동으로 메운다.

  - 따라잡을 때까지: "BACKFILL_MORE" 출력 (워크플로가 다시 부름/스케줄이 이어감)
  - 다 채우면:       "BACKFILL_DONE" 출력 (이후 실행은 즉시 무동작)

경쟁사(competitor)는 현재 스냅샷이라 과거가 없어 기본 제외한다.
"""
from __future__ import annotations

import argparse
import logging
import time
from datetime import date as _date
from datetime import timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.collectors import build_collectors  # noqa: E402
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.pipeline import run_pipeline, yesterday  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()

# 토큰이 URL 로 로깅되는 것 방지(공개 Actions 로그 유출 차단)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

CURSOR_KEY = "backfill_cursor"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="이어받기 백필")
    p.add_argument("--start", default="2025-01-01", help="백필 시작일(커서 없을 때)")
    p.add_argument("--budget-min", type=float, default=40.0, help="이번 실행 최대 작업시간(분)")
    p.add_argument("--skip", default="competitor,creative", help="제외 채널 콤마목록")
    p.add_argument("--reset", action="store_true",
                   help="커서를 초기화해 start 부터 다시 채움(신규 지표 과거 반영용)")
    args = p.parse_args(argv)

    config = load_config()
    store = Store(config.data_dir)

    end = _date.fromisoformat(yesterday())
    start = _date.fromisoformat(args.start)
    if args.reset:
        store.set_kv(CURSOR_KEY, "")
    cursor = store.get_kv(CURSOR_KEY)
    begin = max(start, _date.fromisoformat(cursor) + timedelta(days=1)) if cursor else start

    if begin > end:
        print(f"BACKFILL_DONE (cursor={cursor}, 따라잡음)")
        store.close()
        return 0

    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    cols = [c for c in build_collectors(config, "live") if c.source not in skip]

    deadline = time.monotonic() + args.budget_min * 60
    d = begin
    n = 0
    done = False
    while d <= end:
        run_pipeline(d.isoformat(), config, store, mode="live", collectors=cols)
        store.set_kv(CURSOR_KEY, d.isoformat())
        n += 1
        if d == end:
            done = True
            break
        if time.monotonic() > deadline:
            break
        d += timedelta(days=1)

    last = store.get_kv(CURSOR_KEY)
    store.close()
    if done:
        print(f"BACKFILL_DONE ({n}일 처리, cursor={last})")
    else:
        print(f"BACKFILL_MORE ({n}일 처리, cursor={last} → 다음 실행이 이어감)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
