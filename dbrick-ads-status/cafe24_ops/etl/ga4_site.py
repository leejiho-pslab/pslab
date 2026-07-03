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
}


def _by_date(store, date_from: str, date_to: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="ga4_site"):
        key = FACT_TO_API.get(r["metric"])
        if key:
            out.setdefault(r["date"], {})[key] = float(r["value"])
    return out


def site_trend(store, date_from: str, date_to: str) -> list[dict]:
    """일자별 추이 — [{date, visitors, sessions, page_views, avg_session_duration}]."""
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
    weighted = sum(m.get("avg_session_duration", 0.0) * m.get("sessions", 0.0) for m in by_date.values())
    avg_duration = round(weighted / sessions, 1) if sessions else None
    return {
        "visitors": visitors,
        "sessions": sessions,
        "page_views": page_views,
        "avg_session_duration": avg_duration,
        "pages_per_session": round(page_views / sessions, 2) if sessions else None,
        "days": len(by_date),
    }
