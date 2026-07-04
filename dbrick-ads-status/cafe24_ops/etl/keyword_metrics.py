"""네이버 검색광고 키워드 리포트 집계 — 키워드별 광고비/노출/클릭/전환.

facts(source='naver_keyword') 를 (채널·캠페인·광고그룹·키워드) 단위로 합산하고
CTR/CPC/CVR/ROAS 를 파생한다. 대시보드는 기본적으로 광고비(ad_cost) 소진 기준 내림차순.
"""
from __future__ import annotations

SORTABLE = {"ad_cost", "impressions", "clicks", "conversions", "ctr", "cpc", "roas"}


def _by_keyword(store, date_from: str, date_to: str, channel: str | None = None) -> dict:
    agg: dict[tuple, dict] = {}
    for r in store.get_facts(date_from, date_to, source="naver_keyword"):
        d = r["dims"]
        ch = d.get("channel")
        if channel and ch != channel:
            continue
        key = (ch, d.get("campaign"), d.get("adgroup"), d.get("keyword"))
        e = agg.setdefault(key, {
            "channel": ch, "campaign": d.get("campaign"),
            "adgroup": d.get("adgroup"), "keyword": d.get("keyword"), "m": {},
        })
        e["m"][r["metric"]] = e["m"].get(r["metric"], 0.0) + float(r["value"])
    return agg


def _derive(e: dict) -> dict:
    m = e["m"]
    impr, clicks, conv = m.get("impressions", 0.0), m.get("clicks", 0.0), m.get("conversions", 0.0)
    cost, sales = m.get("ad_cost", 0.0), m.get("ad_sales", 0.0)
    return {
        "channel": e["channel"], "campaign": e["campaign"],
        "adgroup": e["adgroup"], "keyword": e["keyword"],
        "ad_cost": cost, "impressions": impr, "clicks": clicks,
        "conversions": conv, "ad_sales": sales,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cpc": round(cost / clicks) if clicks else None,
        "cvr": round(conv / clicks * 100, 2) if clicks else None,
        "roas": round(sales / cost, 2) if cost else None,
    }


def keyword_report(
    store, date_from: str, date_to: str, channel: str | None = None,
    sort: str = "ad_cost", top_n: int = 300,
) -> list[dict]:
    sort = sort if sort in SORTABLE else "ad_cost"
    items = [_derive(e) for e in _by_keyword(store, date_from, date_to, channel).values()]
    items.sort(key=lambda x: (x.get(sort) if x.get(sort) is not None else -1), reverse=True)
    return items[:top_n]


def keyword_summary(store, date_from: str, date_to: str, channel: str | None = None) -> dict:
    items = [_derive(e) for e in _by_keyword(store, date_from, date_to, channel).values()]
    cost = sum(i["ad_cost"] for i in items)
    impr = sum(i["impressions"] for i in items)
    clicks = sum(i["clicks"] for i in items)
    conv = sum(i["conversions"] for i in items)
    return {
        "keyword_count": len(items),
        "ad_cost": cost, "impressions": impr, "clicks": clicks, "conversions": conv,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cpc": round(cost / clicks) if clicks else None,
        "cvr": round(conv / clicks * 100, 2) if clicks else None,
    }


def keyword_channels(store, date_from: str, date_to: str) -> list[str]:
    """기간 내 존재하는 네이버 키워드 채널 목록(naver_powerlink/naver_place 등)."""
    chans = {e["channel"] for e in _by_keyword(store, date_from, date_to).values() if e["channel"]}
    return sorted(chans)
