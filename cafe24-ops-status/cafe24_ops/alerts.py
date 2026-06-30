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


def _pct_vs_7d_avg(store, date: str) -> float | None:
    base = _date.fromisoformat(date)
    prior = [r["value"] for r in store.get_daily(
        (base - timedelta(days=7)).isoformat(), (base - timedelta(days=1)).isoformat())
        if r["metric"] == "gross_sales"]
    today = store.get_kpi(date).get("gross_sales")
    if today is None or not prior:
        return None
    avg = sum(prior) / len(prior)
    return (today - avg) / avg * 100 if avg > 0 else None


def build_digest(store, date: str) -> list[str]:
    """하루 핵심 요약(아침 브리핑) — 대시보드 안 봐도 한눈에. 사람이 읽는 라인 목록."""
    from .etl.ads_metrics import ads_summary
    from .etl.breakdown import (
        best_products, category_breakdown, crm_counts, device_breakdown, new_returning_trend,
    )

    k = store.get_kpi(date)
    gross, oc, aov = k.get("gross_sales"), k.get("order_count"), k.get("aov")
    lines: list[str] = []
    if gross is not None:
        chg = _pct_vs_7d_avg(store, date)
        chg_s = f" ({chg:+.0f}% vs 7일평균)" if chg is not None else ""
        lines.append(f"💰 매출 ₩{gross:,.0f} · 주문 {oc or 0:,.0f}건 · 객단가 ₩{aov or 0:,.0f}{chg_s}")

    vis, cr = k.get("visitors"), k.get("conversion_rate")
    if vis:
        cr_s = f" · 전환율 {cr:.2f}%" if cr is not None else ""
        lines.append(f"👀 방문자 {vis:,.0f}{cr_s}")

    dev = {d["key"]: d["value"] for d in device_breakdown(store, date)}
    dtot = sum(dev.values())
    if dtot > 0:
        lines.append(f"📱 모바일 {dev.get('mobile', 0) / dtot * 100:.0f}% · "
                     f"PC {dev.get('pc', 0) / dtot * 100:.0f}%")

    nr = new_returning_trend(store, date, date)
    if nr:
        n, r = nr[0]["new"], nr[0]["returning"]
        if n + r > 0:
            lines.append(f"👥 신규 {n / (n + r) * 100:.0f}% · 재구매 {r / (n + r) * 100:.0f}%")

    cats = category_breakdown(store, date)[:3]
    if cats:
        lines.append("🏷️ 카테고리 " + ", ".join(f"{c['key']} ₩{c['value']:,.0f}" for c in cats))

    bp = best_products(store, date, top_n=3)
    if bp:
        lines.append("🏆 베스트 " + ", ".join(str(c["key"]) for c in bp))

    a = ads_summary(store, date)
    if a.get("ad_cost"):
        roas, share = a.get("roas"), a.get("ad_share")
        lines.append(f"📣 광고비 ₩{a['ad_cost']:,.0f} · ROAS {roas if roas is not None else '—'}"
                     f"{f' · 매출대비 {share}%' if share is not None else ''}")

    crm = crm_counts(store, date)
    if crm.get("reviews"):
        lines.append(f"📝 후기 {crm['reviews']:,.0f}건")
    soldout = sum(float(r["value"]) for r in store.get_facts(date, date, metric="soldout_count"))
    if soldout:
        lines.append(f"⛔ 품절 {soldout:,.0f}개")
    return lines


def collection_health_alert(store, date: str) -> dict | None:
    """수집 실패 자가감지 — 해당 일자에 오류로 빠진 채널이 있으면 경고(무인 운영 보호)."""
    import json
    raw = store.get_kv(f"collect_status:{date}")
    if not raw:
        return None
    try:
        status = json.loads(raw)
    except (ValueError, TypeError):
        return None
    errors = status.get("errors") or {}
    if not errors:
        return None
    chans = ", ".join(sorted(errors))
    return {"level": "warning", "type": "collect_error",
            "message": f"수집 실패 채널: {chans} (토큰/연동 점검 필요)"}


def build_alerts(store, date: str) -> list[dict]:
    alerts: list[dict] = []
    for fn in (sales_anomaly, top_creative_alert, collection_health_alert):
        a = fn(store, date)
        if a:
            alerts.append(a)
    alerts.extend(competitor_alerts(store, date))
    return alerts
