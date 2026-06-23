"""대시보드용 서비스 API (FastAPI).

React 대시보드가 호출하는 읽기 전용 엔드포인트.
저장된 KPI/지표 정의를 제공한다.

실행:
    uvicorn api.main:app --reload
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI, Query  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.etl.breakdown import (  # noqa: E402
    best_products,
    category_breakdown,
    crm_counts,
    device_breakdown,
    new_returning_trend,
)
from cafe24_ops.etl.ads_metrics import ads_by_channel, ads_summary, ads_trend  # noqa: E402
from cafe24_ops.etl.compare import period_comparison  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402


def _resolve_date(store: Store, date: str | None) -> str | None:
    if date:
        return date
    dates = store.list_dates()
    return dates[-1] if dates else None


def _best_top_n() -> int:
    for g in _config.metrics.daily_groups:
        if g.get("top_n"):
            return int(g["top_n"])
    return 10

app = FastAPI(title="cafe24-ops-status API", version="0.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Phase 0: 로컬 개발용. 운영 시 도메인 제한.
    allow_methods=["*"],
    allow_headers=["*"],
)

_config = load_config()


def _store() -> Store:
    return Store(_config.data_dir)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "mode": _config.mode}


@app.get("/api/config/metrics")
def metrics_config() -> dict:
    m = _config.metrics
    return {
        "collection": {
            "granularity": m.collection.granularity,
            "run_at": m.collection.run_at,
            "compare_windows": m.collection.compare_windows,
        },
        "summary_cards": m.summary_cards,
        "period_comparison": m.period_comparison_rows,
        "daily_groups": m.daily_groups,
        "charts": m.charts,
    }


@app.get("/api/summary")
def summary(date: str | None = Query(default=None, description="YYYY-MM-DD")) -> dict:
    store = _store()
    try:
        dates = store.list_dates()
        target = date or (dates[-1] if dates else None)
        kpi = store.get_kpi(target) if target else {}
        cards = [
            {"key": c["key"], "label": c["label"], "format": c.get("format"),
             "value": kpi.get(c["key"])}
            for c in _config.metrics.summary_cards
        ]
        return {"date": target, "cards": cards}
    finally:
        store.close()


@app.get("/api/period-comparison")
def period_compare(date: str | None = Query(default=None, description="YYYY-MM-DD")) -> dict:
    store = _store()
    try:
        dates = store.list_dates()
        target = date or (dates[-1] if dates else None)
        if not target:
            return {"date": None, "rows": []}
        return {"date": target, "rows": period_comparison(store, target, _config.metrics)}
    finally:
        store.close()


@app.get("/api/daily")
def daily(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        return {"from": date_from, "to": date_to, "rows": store.get_daily(date_from, date_to)}
    finally:
        store.close()


@app.get("/api/daily-detail")
def daily_detail(date: str | None = Query(default=None, description="YYYY-MM-DD")) -> dict:
    store = _store()
    try:
        dates = store.list_dates()
        target = date or (dates[-1] if dates else None)
        if not target:
            return {"date": None, "device": [], "category": [], "best": [], "crm": {}}
        return {
            "date": target,
            "device": device_breakdown(store, target),
            "category": category_breakdown(store, target),
            "best": best_products(store, target, _best_top_n()),
            "crm": crm_counts(store, target),
        }
    finally:
        store.close()


@app.get("/api/trend")
def trend(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        by_date: dict[str, dict] = {}
        for r in store.get_daily(date_from, date_to):
            by_date.setdefault(r["date"], {})[r["metric"]] = r["value"]
        nr = {x["date"]: x for x in new_returning_trend(store, date_from, date_to)}
        rows = []
        for d in sorted(by_date):
            m = by_date[d]
            rows.append({
                "date": d,
                "gross_sales": m.get("gross_sales"),
                "ad_cost": m.get("ad_cost"),
                "ad_cost_ratio": m.get("ad_cost_ratio"),
                "new_sales": nr.get(d, {}).get("new"),
                "returning_sales": nr.get(d, {}).get("returning"),
            })
        return {"from": date_from, "to": date_to, "rows": rows}
    finally:
        store.close()


@app.get("/api/ads/summary")
def ads_summary_ep(date: str | None = Query(default=None)) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        return {"date": target, **(ads_summary(store, target) if target else {})}
    finally:
        store.close()


@app.get("/api/ads/channels")
def ads_channels_ep(date: str | None = Query(default=None)) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        return {"date": target, "channels": ads_by_channel(store, target) if target else []}
    finally:
        store.close()


@app.get("/api/ads/trend")
def ads_trend_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        return {"from": date_from, "to": date_to, "rows": ads_trend(store, date_from, date_to)}
    finally:
        store.close()


@app.get("/api/dates")
def dates() -> dict:
    store = _store()
    try:
        return {"dates": store.list_dates()}
    finally:
        store.close()
