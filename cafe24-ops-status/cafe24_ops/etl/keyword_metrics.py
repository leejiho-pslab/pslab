"""광고 히스토리(네이버 키워드) 집계 — 파워링크/플레이스 키워드별 성과 리포트.

facts(source='keyword') 의 keyword 차원을 집계해 CTR/CPC 를 파생하고,
채널(파워링크/플레이스)별 키워드 리포트 테이블을 만든다.
"""
from __future__ import annotations

SORTABLE = {"ad_cost", "clicks", "impressions", "conversions"}


def _by_keyword(store, date_from: str, date_to: str, channel: str) -> dict[str, dict]:
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="keyword"):
        if r["dims"].get("channel") != channel:
            continue
        kw = r["dims"].get("keyword")
        if not kw:
            continue
        adgroup = r["dims"].get("adgroup", "")
        key = f"{adgroup}::{kw}"
        e = agg.setdefault(key, {"keyword": kw, "adgroup": adgroup, "m": {}})
        e["m"][r["metric"]] = e["m"].get(r["metric"], 0.0) + float(r["value"])
    return agg


def _derive(e: dict) -> dict:
    m = e["m"]
    impr, clicks, conv = m.get("impressions", 0.0), m.get("clicks", 0.0), m.get("conversions", 0.0)
    cost = m.get("ad_cost", 0.0)
    return {
        "keyword": e["keyword"], "adgroup": e["adgroup"],
        "impressions": impr, "clicks": clicks, "conversions": conv, "ad_cost": cost,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cpc": round(cost / clicks) if clicks else None,
    }


def keyword_report_range(
    store, date_from: str, date_to: str, channel: str = "naver_powerlink", sort: str = "ad_cost"
) -> dict:
    sort = sort if sort in SORTABLE else "ad_cost"
    items = [_derive(e) for e in _by_keyword(store, date_from, date_to, channel).values()]
    items.sort(key=lambda x: (x.get(sort) if x.get(sort) is not None else -1), reverse=True)

    impr = sum(i["impressions"] for i in items)
    clicks = sum(i["clicks"] for i in items)
    cost = sum(i["ad_cost"] for i in items)
    conv = sum(i["conversions"] for i in items)
    return {
        "from": date_from, "to": date_to, "channel": channel, "sort": sort,
        "summary": {
            "keyword_count": len(items),
            "impressions": impr, "clicks": clicks, "ad_cost": cost, "conversions": conv,
            "ctr": round(clicks / impr * 100, 2) if impr else None,
            "cpc": round(cost / clicks) if clicks else None,
        },
        "keywords": items,
    }
