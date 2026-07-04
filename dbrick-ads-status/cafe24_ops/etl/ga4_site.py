"""GA4 사이트 분석 집계 — facts(source='ga4_site') → 기간 요약 + 일자별 추이.

방문자/세션/페이지뷰는 기간 합계, 평균 체류시간은 세션수 가중평균으로 낸다
(단순 평균은 트래픽 적은 날이 과대 반영됨).
"""
from __future__ import annotations

# facts metric 키(site_ 접두어) → API/프론트 노출 키
FACT_TO_API = {
    "site_visitors": "visitors",
    "site_sessions": "sessions",
    "site_page_views": "page_views",
    "site_avg_duration": "avg_session_duration",
    "site_new": "new_users",
    "site_returning": "returning_users",
}


def _by_date(store, date_from: str, date_to: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="ga4_site"):
        key = FACT_TO_API.get(r["metric"])
        if key:
            out.setdefault(r["date"], {})[key] = float(r["value"])
    return out


def site_trend(store, date_from: str, date_to: str) -> list[dict]:
    """일자별 추이 — [{date, visitors, sessions, page_views, avg_session_duration, new_users, returning_users}]."""
    by_date = _by_date(store, date_from, date_to)
    return [
        {"date": d, **{k: by_date[d].get(k) for k in FACT_TO_API.values()}}
        for d in sorted(by_date)
    ]


def site_summary(store, date_from: str, date_to: str) -> dict:
    """기간 요약 — 합계 + 세션 가중평균 체류시간. 데이터 없으면 값들이 None/0."""
    by_date = _by_date(store, date_from, date_to)
    visitors = sum(m.get("visitors", 0.0) for m in by_date.values())
    sessions = sum(m.get("sessions", 0.0) for m in by_date.values())
    page_views = sum(m.get("page_views", 0.0) for m in by_date.values())
    new_users = sum(m.get("new_users", 0.0) for m in by_date.values())
    returning_users = sum(m.get("returning_users", 0.0) for m in by_date.values())
    weighted = sum(m.get("avg_session_duration", 0.0) * m.get("sessions", 0.0) for m in by_date.values())
    avg_duration = round(weighted / sessions, 1) if sessions else None
    return {
        "visitors": visitors,
        "sessions": sessions,
        "page_views": page_views,
        "new_users": new_users,
        "returning_users": returning_users,
        "avg_session_duration": avg_duration,
        "pages_per_session": round(page_views / sessions, 2) if sessions else None,
        "days": len(by_date),
    }


def _sum_by_dim(store, date_from, date_to, source, dim_key):
    """source 별 facts 를 dims[dim_key] 로 묶어 metric 합계를 낸다 → {dim_value: {metric: sum}}."""
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source=source):
        dv = (r.get("dims") or {}).get(dim_key)
        if not dv:
            continue
        m = agg.setdefault(dv, {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    return agg


def source_medium_breakdown(store, sel_from, sel_to, cmp_from=None, cmp_to=None) -> list[dict]:
    """GA4 매체별(sessionSourceMedium) 세션/사용자/전환 — 세션 내림차순, 비교기간 대비 세션 증감."""
    sel = _sum_by_dim(store, sel_from, sel_to, "ga4_channel", "source_medium")
    cmp = _sum_by_dim(store, cmp_from, cmp_to, "ga4_channel", "source_medium") if cmp_from and cmp_to else {}
    rows = []
    for sm, m in sel.items():
        sessions = m.get("sessions", 0.0)
        prev = (cmp.get(sm) or {}).get("sessions")
        delta = round((sessions - prev) / prev * 100, 1) if prev else None
        rows.append({
            "source_medium": sm,
            "sessions": sessions,
            "users": m.get("users", 0.0),
            "conversions": m.get("conversions", 0.0),
            "sessions_delta": delta,
        })
    return sorted(rows, key=lambda x: -x["sessions"])


def top_pages(store, date_from: str, date_to: str, limit: int = 10) -> list[dict]:
    """GA4 페이지별(pageTitle) 조회수 상위 N — 조회수 내림차순."""
    agg = _sum_by_dim(store, date_from, date_to, "ga4_page", "page")
    rows = [{"page": p, "views": m.get("views", 0.0)} for p, m in agg.items()]
    return sorted(rows, key=lambda x: -x["views"])[:limit]
