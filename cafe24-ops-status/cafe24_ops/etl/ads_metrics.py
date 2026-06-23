"""광고 대시보드 집계 — 채널별 성과 + 자사몰 매출과 결합한 광고 효율.

facts(source='ads') 의 채널 차원을 집계하고, ROAS/CTR/CPC/CPA 를 파생한다.
자사몰 매출(kpi_daily.gross_sales)과 결합해 광고 매출 비중(ad_share)을 구한다.
"""
from __future__ import annotations


def _by_channel(store, date_from: str, date_to: str) -> dict[str, dict]:
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="ads"):
        ch = r["dims"].get("channel")
        if not ch:
            continue
        m = agg.setdefault(ch, {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    return agg


def _derive(m: dict) -> dict:
    cost = m.get("ad_cost", 0.0)
    sales = m.get("ad_sales", 0.0)
    impr = m.get("impressions", 0.0)
    clicks = m.get("clicks", 0.0)
    conv = m.get("conversions", 0.0)
    return {
        "ad_cost": cost,
        "ad_sales": sales,
        "conversions": conv,
        "roas": round(sales / cost, 2) if cost else None,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cpc": round(cost / clicks) if clicks else None,
        "cpa": round(cost / conv) if conv else None,
    }


def ads_by_channel(store, date: str) -> list[dict]:
    out = [{"channel": ch, **_derive(m)} for ch, m in _by_channel(store, date, date).items()]
    return sorted(out, key=lambda x: -x["ad_sales"])


def ads_summary(store, date: str) -> dict:
    channels = ads_by_channel(store, date)
    cost = sum(c["ad_cost"] for c in channels)
    sales = sum(c["ad_sales"] for c in channels)
    gross = store.get_kpi(date).get("gross_sales")
    return {
        "ad_cost": cost,
        "ad_sales": sales,
        "roas": round(sales / cost, 2) if cost else None,
        "ad_share": round(sales / gross * 100, 2) if gross else None,
        "gross_sales": gross,
        "channels": len(channels),
    }


def ads_trend(store, date_from: str, date_to: str) -> list[dict]:
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="ads"):
        m = by_date.setdefault(r["date"], {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    rows = []
    for d in sorted(by_date):
        m = by_date[d]
        cost, sales = m.get("ad_cost", 0.0), m.get("ad_sales", 0.0)
        rows.append({"date": d, "ad_cost": cost, "ad_sales": sales,
                     "roas": round(sales / cost, 2) if cost else None})
    return rows
