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
from fastapi.staticfiles import StaticFiles  # noqa: E402

from cafe24_ops.alerts import build_alerts, build_commentary, build_digest  # noqa: E402
from cafe24_ops.clients.region_sheet import fetch_region_status  # noqa: E402
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.etl.breakdown import (  # noqa: E402
    best_products,
    category_breakdown,
    crm_counts,
    device_breakdown,
    device_perf,
    new_returning_trend,
    visitor_detail,
    visitor_trend,
)
from cafe24_ops.etl.ads_metrics import (  # noqa: E402
    ads_by_channel,
    ads_channel_trend,
    ads_overview,
    ads_summary,
    ads_trend,
)
from cafe24_ops.etl.compare import period_comparison, summary_cards_range  # noqa: E402
from cafe24_ops.etl.competitor_metrics import (  # noqa: E402
    bestseller_changes,
    competitor_ad_creatives,
    competitor_snapshot,
    competitor_trend,
    naver_search,
    naver_trend,
)
from cafe24_ops.etl.creative_metrics import (  # noqa: E402
    creative_fatigue,
    creative_overview,
    creative_trend,
    creatives_ranked,
)
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
    """헬스 + 데이터 신선도(모니터링용). DB 접근 실패해도 200 으로 status 표기."""
    info: dict = {"status": "ok", "mode": _config.mode}
    store = _store()
    try:
        dates = store.list_dates()
        info["db"] = store.db.dialect
        info["latest_date"] = dates[-1] if dates else None
        info["dates_count"] = len(dates)
        info["facts"] = store.count_facts()
    except Exception as e:  # noqa: BLE001 - 헬스체크는 진단정보만
        info["status"] = "degraded"
        info["error"] = f"{type(e).__name__}: {e}"
    finally:
        store.close()
    return info


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
def summary(
    date: str | None = Query(default=None, description="YYYY-MM-DD"),
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
) -> dict:
    """요약 카드. from/to 가 오면 그 기간 합계(파생지표는 재계산), 없으면 단일일 값."""
    store = _store()
    try:
        # 기간이 지정되면 기간 합계 카드(상단 요약이 '기간 비교' 표와 일치)
        if date_from and date_to:
            cards = summary_cards_range(store, date_from, date_to, _config.metrics)
            return {"date": date_to, "from": date_from, "to": date_to, "cards": cards}
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


@app.get("/api/digest")
def digest(date: str | None = Query(default=None, description="YYYY-MM-DD")) -> dict:
    """일일 브리핑 — 핵심 KPI 요약 라인 + 이상치 알림(대시보드 상단 배너용)."""
    store = _store()
    try:
        dates = store.list_dates()
        target = date or (dates[-1] if dates else None)
        if not target:
            return {"date": None, "lines": [], "alerts": []}
        return {
            "date": target,
            "lines": build_digest(store, target),
            "alerts": build_alerts(store, target),
            "commentary": build_commentary(store, target),
        }
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
            return {"date": None, "device": [], "device_perf": [], "visitor": {},
                    "category": [], "best": [], "crm": {}}
        return {
            "date": target,
            "device": device_breakdown(store, target),
            "device_perf": device_perf(store, target),
            "visitor": visitor_detail(store, target),
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


@app.get("/api/visitor-trend")
def visitor_trend_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    """일별 방문자 추이(전체/신규/재방문) — 그래프용."""
    store = _store()
    try:
        return {"from": date_from, "to": date_to,
                "rows": visitor_trend(store, date_from, date_to)}
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


@app.get("/api/ads/overview")
def ads_overview_ep(
    sel_from: str = Query(..., alias="from"),
    sel_to: str = Query(..., alias="to"),
    cmp_from: str = Query(..., alias="cmp_from"),
    cmp_to: str = Query(..., alias="cmp_to"),
) -> dict:
    store = _store()
    try:
        return ads_overview(store, sel_from, sel_to, cmp_from, cmp_to)
    finally:
        store.close()


@app.get("/api/ads/channel-trend")
def ads_channel_trend_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        return ads_channel_trend(store, date_from, date_to)
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


@app.get("/api/creatives")
def creatives_ep(
    date: str | None = Query(default=None),
    top_n: int = Query(default=10),
    sort: str = Query(default="roas"),
) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        items = creatives_ranked(store, target, top_n, sort) if target else []
        return {"date": target, "sort": sort, "creatives": items}
    finally:
        store.close()


@app.get("/api/creatives/overview")
def creatives_overview_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    sort: str = Query(default="roas"),
) -> dict:
    store = _store()
    try:
        return creative_overview(store, date_from, date_to, sort)
    finally:
        store.close()


@app.get("/api/creatives/fatigue")
def creatives_fatigue_ep(date: str | None = Query(default=None)) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        return {"date": target, "items": creative_fatigue(store, target) if target else []}
    finally:
        store.close()


@app.get("/api/creatives/trend")
def creatives_trend_ep(
    creative_id: str = Query(...),
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        return {"creative_id": creative_id,
                "rows": creative_trend(store, creative_id, date_from, date_to)}
    finally:
        store.close()


@app.get("/api/competitors")
def competitors_ep(date: str | None = Query(default=None)) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        return {"date": target, "competitors": competitor_snapshot(store, target) if target else []}
    finally:
        store.close()


@app.get("/api/competitors/trend")
def competitors_trend_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        return {"from": date_from, "to": date_to, "rows": competitor_trend(store, date_from, date_to)}
    finally:
        store.close()


@app.get("/api/competitors/naver")
def competitors_naver_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    store = _store()
    try:
        return {"search": naver_search(store, date_to), "trend": naver_trend(store, date_from, date_to)}
    finally:
        store.close()


@app.get("/api/competitors/creatives")
def competitors_creatives_ep(date: str | None = Query(default=None)) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        return {"date": target, "competitors": competitor_ad_creatives(store, target) if target else []}
    finally:
        store.close()


@app.get("/api/competitors/best-changes")
def competitors_best_changes_ep(date: str | None = Query(default=None)) -> dict:
    store = _store()
    try:
        target = _resolve_date(store, date)
        return {"date": target, "items": bestseller_changes(store, target) if target else []}
    finally:
        store.close()


@app.get("/api/dates")
def dates() -> dict:
    store = _store()
    try:
        return {"dates": store.list_dates()}
    finally:
        store.close()


@app.get("/api/region-status")
def region_status_ep() -> dict:
    """대시보드 하단 '온라인 인입 지역 현황' — 구글 시트를 그대로 노출(수동 갱신, 5분 캐시)."""
    cfg = _config.sources.region_status
    sheet_id, gid = cfg.get("sheet_id"), cfg.get("gid")
    if not sheet_id or not gid:
        return {"headers": [], "rows": [], "error": "region_status 시트 설정 없음(config/sources.yaml)"}
    return fetch_region_status(sheet_id, gid)


# 빌드된 React 대시보드를 같은 서비스에서 서빙 (있을 때만).
# /api/* 라우트가 먼저 매칭되고, 그 외 경로는 정적 파일 → 단일 배포 단위.
_dist = _config.project_root / "dashboard" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="dashboard")
