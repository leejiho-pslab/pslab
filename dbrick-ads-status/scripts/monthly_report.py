#!/usr/bin/env python3
"""월간 비교 리포트용 집계 추출 — DB(facts)에서 두 달치 광고/GA4/키워드/경쟁사 지표를 뽑아
JSON 한 블록으로 출력한다(API 재호출 없음, 이미 수집된 facts만 읽음).

사용:
    python scripts/monthly_report.py --a 2026-05 --b 2026-06
출력: `===MONTHLY_JSON_BEGIN===` ~ `===MONTHLY_JSON_END===` 사이에 JSON.
"""
from __future__ import annotations

import argparse
import calendar
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.etl.ads_metrics import ads_channels_range, ads_summary_range  # noqa: E402
from cafe24_ops.etl.competitor_metrics import naver_trend  # noqa: E402
from cafe24_ops.etl.ga4_site import site_summary  # noqa: E402
from cafe24_ops.etl.keyword_metrics import keyword_report  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()


def month_range(ym: str) -> tuple[str, str]:
    y, m = (int(x) for x in ym.split("-"))
    last = calendar.monthrange(y, m)[1]
    return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{last:02d}"


def month_block(store: Store, ym: str) -> dict:
    d0, d1 = month_range(ym)
    summary = ads_summary_range(store, d0, d1)
    channels = ads_channels_range(store, d0, d1)
    ga4 = site_summary(store, d0, d1)
    kw = keyword_report(store, d0, d1, channel="naver_powerlink", sort="ad_cost", top_n=10)
    return {
        "month": ym, "from": d0, "to": d1,
        "summary": summary,
        "channels": channels,
        "ga4_site": ga4,
        "top_keywords": [
            {k: r.get(k) for k in ("keyword", "campaign", "ad_cost", "clicks", "ctr", "cpc")}
            for r in kw
        ],
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--a", required=True, help="비교기준(이전) 월 YYYY-MM")
    p.add_argument("--b", required=True, help="대상(최근) 월 YYYY-MM")
    args = p.parse_args(argv)

    config = load_config()
    store = Store(config.data_dir)
    try:
        a = month_block(store, args.a)
        b = month_block(store, args.b)
        # 경쟁사 네이버 트렌드(대상 월 전체) — 있으면 첨부
        try:
            comp = naver_trend(store, b["from"], b["to"])
        except Exception as e:  # noqa: BLE001
            comp = {"error": str(e)}
        dates = store.list_dates()
        out = {
            "a": a, "b": b, "competitor_trend": comp,
            "data_coverage": {"first": dates[0] if dates else None,
                              "last": dates[-1] if dates else None, "count": len(dates)},
        }
    finally:
        store.close()

    print("===MONTHLY_JSON_BEGIN===")
    print(json.dumps(out, ensure_ascii=False, default=float))
    print("===MONTHLY_JSON_END===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
