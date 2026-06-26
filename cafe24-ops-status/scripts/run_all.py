#!/usr/bin/env python3
"""전체 파이프라인 1회 실행 (데일리 수집의 진입점).

사용법:
    python scripts/run_all.py                  # 어제 날짜, mock 모드
    python scripts/run_all.py --date 2026-06-17
    python scripts/run_all.py --mode live      # 실제 API (Phase 1~)
    python scripts/run_all.py --days 7         # 최근 7일 한번에 백필
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import date as _date
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.pipeline import run_pipeline, yesterday  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()  # config/secrets.env → 환경변수 (live 모드 자격증명)


def _fmt(metric: str, value: float) -> str:
    if metric in ("conversion_rate", "ad_cost_ratio"):
        return f"{value:.2f}%"
    if metric in ("gross_sales", "ad_sales", "ad_cost", "aov"):
        return f"₩{value:,.0f}"
    return f"{value:,.0f}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="cafe24-ops-status 데일리 파이프라인")
    parser.add_argument("--date", help="수집 기준일 (YYYY-MM-DD). 기본: 어제")
    parser.add_argument("--days", type=int, default=1, help="기준일 포함 최근 N일 백필 (기본 1)")
    parser.add_argument("--start", help="백필 시작일 (YYYY-MM-DD). 지정 시 start~기준일 전체 백필(--days 무시)")
    parser.add_argument("--skip", default="",
                        help="제외할 수집기 source 콤마목록 (예: competitor,creative). "
                             "경쟁사는 현재 스냅샷이라 과거 백필 대상이 아님.")
    parser.add_argument("--mode", choices=["mock", "live"], help="mock(기본) | live")
    parser.add_argument("--quiet", action="store_true", help="단계 로그 숨김")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.WARNING if args.quiet else logging.INFO,
        format="%(message)s",
    )

    config = load_config()
    store = Store(config.data_dir)
    base = _date.fromisoformat(args.date) if args.date else _date.fromisoformat(yesterday())

    # 백필 날짜 목록: --start 가 있으면 start~base 전체, 없으면 최근 --days 일.
    if args.start:
        start = _date.fromisoformat(args.start)
        span = (base - start).days
        dates = [(start + timedelta(days=i)).isoformat() for i in range(span + 1)]
    else:
        dates = [(base - timedelta(days=i)).isoformat() for i in range(args.days - 1, -1, -1)]

    # 채널(수집기) 필터: --skip 으로 제외. (경쟁사는 과거 스냅샷이 없어 백필 제외 권장)
    from cafe24_ops.collectors import build_collectors  # noqa: E402

    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    cols = [c for c in build_collectors(config, args.mode or "mock") if c.source not in skip]

    last = None
    for d in dates:
        last = run_pipeline(d, config, store, mode=args.mode, collectors=cols)

    print("\n===== 요약 (" + (last.date if last else "-") + ", mode=" + (last.mode if last else "-") + ") =====")
    if last:
        for card in config.metrics.summary_cards:
            k = card["key"]
            if k in last.kpi:
                print(f"  {card['label']:<14} {_fmt(k, last.kpi[k])}")
    print(f"  저장 위치: {store.db_path}")
    store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
