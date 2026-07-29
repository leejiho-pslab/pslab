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
from cafe24_ops.etl.ga4_site import (  # noqa: E402
    channel_breakdown,
    entry_paths,
    exit_pages,
    funnel_by_channel,
    prev_period,
    purchase_funnel,
    site_summary,
    site_trend,
    source_medium_breakdown,
    top_pages,
)
from cafe24_ops.etl.keyword_metrics import keyword_report_range  # noqa: E402
from cafe24_ops.etl.monthly_report import (  # noqa: E402
    latest_complete_month,
    monthly_report_data,
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


@app.get("/api/ads/keywords")
def ads_keywords_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    channel: str = Query(default="naver_powerlink"),
    sort: str = Query(default="ad_cost"),
) -> dict:
    store = _store()
    try:
        return keyword_report_range(store, date_from, date_to, channel, sort)
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


@app.get("/api/ga4/site")
def ga4_site_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
) -> dict:
    """GA4 사이트 요약 + 일자별 추이."""
    store = _store()
    try:
        return {
            "from": date_from, "to": date_to,
            "summary": site_summary(store, date_from, date_to),
            "trend": site_trend(store, date_from, date_to),
        }
    finally:
        store.close()


@app.get("/api/ga4/channels")
def ga4_channels_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    cmp_from: str | None = Query(default=None),
    cmp_to: str | None = Query(default=None),
) -> dict:
    """GA4 매체별 유입·전환 — 채널 합산(channels)과 원본 source/medium(rows) 둘 다.
    비교기간 미지정 시 직전 동일 길이 기간을 자동으로 쓴다."""
    cf, ct = (cmp_from, cmp_to) if (cmp_from and cmp_to) else prev_period(date_from, date_to)
    store = _store()
    try:
        return {
            "from": date_from, "to": date_to, "cmp_from": cf, "cmp_to": ct,
            "channels": channel_breakdown(store, date_from, date_to, cf, ct),
            "rows": source_medium_breakdown(store, date_from, date_to, cf, ct),
        }
    finally:
        store.close()


@app.get("/api/ga4/pages")
def ga4_pages_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    limit: int = Query(default=10),
) -> dict:
    """GA4 인기 페이지 TOP N."""
    store = _store()
    try:
        return {"from": date_from, "to": date_to,
                "rows": top_pages(store, date_from, date_to, limit)}
    finally:
        store.close()


@app.get("/api/ga4/journey")
def ga4_journey_ep(
    date_from: str = Query(..., alias="from"),
    date_to: str = Query(..., alias="to"),
    cmp_from: str | None = Query(default=None),
    cmp_to: str | None = Query(default=None),
    channel: str | None = Query(default=None),
) -> dict:
    """GA4 유입·이탈·구매 경로 한 번에.

    - entry_paths : 어떤 광고가 어느 페이지로 보내는지(유입 경로 시작점)
    - exit_pages  : 어느 페이지에서 이탈이 늘고 있는지(직전 기간 대비 %p)
    - funnel      : 구매까지 단계별 통과율/병목
    - funnel_channels : 채널별 시작→결제완료 전환율 비교
    비교기간을 안 주면 직전 동일 길이 기간을 자동으로 쓴다.
    """
    cf, ct = (cmp_from, cmp_to) if (cmp_from and cmp_to) else prev_period(date_from, date_to)
    store = _store()
    try:
        return {
            "from": date_from, "to": date_to, "cmp_from": cf, "cmp_to": ct,
            "channel": channel,
            "entry_paths": entry_paths(store, date_from, date_to),
            "exit_pages": exit_pages(store, date_from, date_to, cf, ct),
            "funnel": purchase_funnel(store, date_from, date_to, channel),
            "funnel_channels": funnel_by_channel(store, date_from, date_to),
        }
    finally:
        store.close()


@app.get("/api/report/monthly")
def report_monthly_ep(month: str | None = Query(default=None)) -> dict:
    """월간 리포트 데이터 — month(YYYY-MM) 미지정 시 '지난달(완결된 최근 월)' 자동.
    매월 1일이면 자동으로 전월 리포트가 기본으로 잡힌다."""
    store = _store()
    try:
        m = month or latest_complete_month(store)
        return monthly_report_data(store, m)
    finally:
        store.close()


@app.get("/api/report/monthly.docx")
def report_monthly_docx_ep(month: str | None = Query(default=None)):
    """월간 리포트 Word(.docx) 다운로드."""
    from fastapi.responses import StreamingResponse  # noqa: PLC0415

    from cafe24_ops.report_docx import build_report_docx  # noqa: PLC0415

    store = _store()
    try:
        m = month or latest_complete_month(store)
        data = monthly_report_data(store, m)
    finally:
        store.close()
    blob = build_report_docx(data)
    fname = f"keek_ad_report_{m}.docx"
    return StreamingResponse(
        iter([blob]),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# 빌드된 React 대시보드를 같은 서비스에서 서빙 (있을 때만).
# /api/* 라우트가 먼저 매칭되고, 그 외 경로는 정적 파일 → 단일 배포 단위.
_dist = _config.project_root / "dashboard" / "dist"
if _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="dashboard")
