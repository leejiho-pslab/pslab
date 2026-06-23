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
        "impressions": impr,
        "clicks": clicks,
        "conversions": conv,
        "roas": round(sales / cost, 2) if cost else None,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cvr": round(conv / clicks * 100, 2) if clicks else None,
        "cpc": round(cost / clicks) if clicks else None,
        "cpa": round(cost / conv) if conv else None,
    }


def ads_channels_range(store, date_from: str, date_to: str) -> list[dict]:
    items = [{"channel": ch, **_derive(m)} for ch, m in _by_channel(store, date_from, date_to).items()]
    total_cost = sum(i["ad_cost"] for i in items) or 1.0
    for i in items:
        i["budget_share"] = round(i["ad_cost"] / total_cost * 100, 1)
    return sorted(items, key=lambda x: -x["ad_sales"])


def _gross_in_range(store, date_from: str, date_to: str) -> float:
    return sum(r["value"] for r in store.get_daily(date_from, date_to) if r["metric"] == "gross_sales")


def ads_summary_range(store, date_from: str, date_to: str) -> dict:
    channels = ads_channels_range(store, date_from, date_to)
    cost = sum(c["ad_cost"] for c in channels)
    sales = sum(c["ad_sales"] for c in channels)
    impr = sum(c["impressions"] for c in channels)
    clicks = sum(c["clicks"] for c in channels)
    conv = sum(c["conversions"] for c in channels)
    gross = _gross_in_range(store, date_from, date_to)
    return {
        "ad_cost": cost, "ad_sales": sales, "impressions": impr, "clicks": clicks,
        "conversions": conv,
        "roas": round(sales / cost, 2) if cost else None,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cvr": round(conv / clicks * 100, 2) if clicks else None,
        "ad_share": round(sales / gross * 100, 2) if gross else None,
        "gross_sales": gross, "channels": len(channels),
    }


_DELTA_KEYS = ["ad_cost", "ad_sales", "impressions", "clicks", "conversions",
               "roas", "ctr", "cvr", "ad_share"]


def _delta(a, b):
    if a is None or b in (None, 0):
        return None
    return round((a - b) / b * 100, 1)


def ads_overview(store, sel_from, sel_to, cmp_from, cmp_to) -> dict:
    """선택기간 vs 비교기간 — 요약/채널 + 지표별 증감률."""
    sel = ads_summary_range(store, sel_from, sel_to)
    cmp = ads_summary_range(store, cmp_from, cmp_to)
    deltas = {k: _delta(sel.get(k), cmp.get(k)) for k in _DELTA_KEYS}
    return {
        "selected": {"from": sel_from, "to": sel_to, "summary": sel,
                     "channels": ads_channels_range(store, sel_from, sel_to)},
        "comparison": {"from": cmp_from, "to": cmp_to, "summary": cmp,
                       "channels": ads_channels_range(store, cmp_from, cmp_to)},
        "deltas": deltas,
    }


def ads_by_channel(store, date: str) -> list[dict]:
    return ads_channels_range(store, date, date)


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
