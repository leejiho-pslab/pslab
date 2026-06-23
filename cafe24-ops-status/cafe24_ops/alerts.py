"""알림 — 이상치/Top 소재/경쟁사 변화 감지.

저장된 데이터로부터 운영자가 바로 볼만한 신호를 만든다.
scripts/notify.py 가 이 함수들을 호출해 출력/푸시한다.
"""
from __future__ import annotations

from datetime import date as _date
from datetime import timedelta

from .etl.competitor_metrics import competitor_snapshot
from .etl.creative_metrics import creatives_ranked


def sales_anomaly(store, date: str, drop_pct: float = 30.0) -> dict | None:
    """당일 매출을 최근 7일 평균과 비교해 급락/급증을 감지."""
    base = _date.fromisoformat(date)
    w_from = (base - timedelta(days=7)).isoformat()
    w_to = (base - timedelta(days=1)).isoformat()
    prior = [r["value"] for r in store.get_daily(w_from, w_to) if r["metric"] == "gross_sales"]
    today = store.get_kpi(date).get("gross_sales")
    if today is None or not prior:
        return None
    avg = sum(prior) / len(prior)
    if avg <= 0:
        return None
    change = (today - avg) / avg * 100
    if change <= -drop_pct:
        return {"level": "warning", "type": "sales_drop",
                "message": f"매출이 최근 7일 평균 대비 {change:.0f}% 하락 (₩{today:,.0f})",
                "value": round(change, 1)}
    if change >= drop_pct * 2:
        return {"level": "info", "type": "sales_spike",
                "message": f"매출 급증 +{change:.0f}% (₩{today:,.0f})",
                "value": round(change, 1)}
    return None


def top_creative_alert(store, date: str) -> dict | None:
    items = creatives_ranked(store, date, top_n=1, sort="roas")
    if not items or items[0]["roas"] is None:
        return None
    c = items[0]
    return {"level": "info", "type": "top_creative",
            "message": f"최고 성과 소재: {c['name']} (ROAS {c['roas']}x, {c['channel']})"}


def competitor_alerts(store, date: str) -> list[dict]:
    base = _date.fromisoformat(date)
    prev = (base - timedelta(days=1)).isoformat()
    today = {c["name"]: c for c in competitor_snapshot(store, date)}
    yest = {c["name"]: c for c in competitor_snapshot(store, prev)}
    out = []
    for name, c in today.items():
        p = yest.get(name)
        cur, old = c.get("active_promotions"), (p or {}).get("active_promotions")
        if p and cur is not None and old is not None and cur > old:
            out.append({"level": "info", "type": "competitor_promo",
                        "message": f"{name} 프로모션 증가 {int(old)}→{int(cur)}건"})
    return out


def build_alerts(store, date: str) -> list[dict]:
    alerts: list[dict] = []
    for fn in (sales_anomaly, top_creative_alert):
        a = fn(store, date)
        if a:
            alerts.append(a)
    alerts.extend(competitor_alerts(store, date))
    return alerts
