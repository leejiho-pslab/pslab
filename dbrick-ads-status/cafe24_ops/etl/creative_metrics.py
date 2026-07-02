"""광고 히스토리(소재) 집계 — 소재별 성과 랭킹 + 피로도(성과 하락) 신호.

facts(source='creative') 의 creative 차원을 집계해 CTR/ROAS/CVR 을 파생하고,
성과 좋은 소재를 한번에 선별할 수 있도록 정렬/플래그를 만든다.
"""
from __future__ import annotations

from datetime import date as _date
from datetime import timedelta

SORTABLE = {"roas", "ctr", "cvr", "ad_sales", "conversions"}


def _by_creative(store, date_from: str, date_to: str) -> dict[str, dict]:
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="creative"):
        cid = r["dims"].get("creative_id")
        if not cid:
            continue
        e = agg.setdefault(cid, {"name": r["dims"].get("name", cid),
                                 "channel": r["dims"].get("channel"), "thumb": "", "m": {}})
        # 소재명/이미지는 최신(비어있지 않은) 값으로 갱신
        if r["dims"].get("name"):
            e["name"] = r["dims"]["name"]
        if r["dims"].get("thumb"):
            e["thumb"] = r["dims"]["thumb"]
        e["m"][r["metric"]] = e["m"].get(r["metric"], 0.0) + float(r["value"])
    return agg


def _derive(cid: str, e: dict) -> dict:
    m = e["m"]
    impr, clicks, conv = m.get("impressions", 0.0), m.get("clicks", 0.0), m.get("conversions", 0.0)
    cost, sales = m.get("ad_cost", 0.0), m.get("ad_sales", 0.0)
    return {
        "creative_id": cid, "name": e["name"], "channel": e["channel"],
        "thumb": e.get("thumb") or None,
        "impressions": impr, "clicks": clicks, "conversions": conv,
        "ad_cost": cost, "ad_sales": sales,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "roas": round(sales / cost, 2) if cost else None,
        "cvr": round(conv / clicks * 100, 2) if clicks else None,
        "cpc": round(cost / clicks) if clicks else None,
    }


def creatives_ranked_range(
    store, date_from: str, date_to: str, top_n: int = 50, sort: str = "roas"
) -> list[dict]:
    sort = sort if sort in SORTABLE else "roas"
    items = [_derive(cid, e) for cid, e in _by_creative(store, date_from, date_to).items()]
    items.sort(key=lambda x: (x.get(sort) if x.get(sort) is not None else -1), reverse=True)
    return items[:top_n]


def creatives_ranked(store, date: str, top_n: int = 10, sort: str = "roas") -> list[dict]:
    return creatives_ranked_range(store, date, date, top_n, sort)


def creatives_summary_range(store, date_from: str, date_to: str) -> dict:
    items = [_derive(cid, e) for cid, e in _by_creative(store, date_from, date_to).items()]
    impr = sum(i["impressions"] for i in items)
    clicks = sum(i["clicks"] for i in items)
    conv = sum(i["conversions"] for i in items)
    cost = sum(i["ad_cost"] for i in items)
    sales = sum(i["ad_sales"] for i in items)
    return {
        "creative_count": len(items),
        "channels": len({i["channel"] for i in items}),
        "impressions": impr, "clicks": clicks, "conversions": conv,
        "ad_cost": cost, "ad_sales": sales,
        "roas": round(sales / cost, 2) if cost else None,
        "ctr": round(clicks / impr * 100, 2) if impr else None,
        "cvr": round(conv / clicks * 100, 2) if clicks else None,
    }


def creatives_by_channel_range(store, date_from: str, date_to: str, sort: str = "roas") -> list[dict]:
    items = creatives_ranked_range(store, date_from, date_to, top_n=10**6, sort=sort)
    by_ch: dict[str, list] = {}
    for it in items:
        by_ch.setdefault(it["channel"], []).append(it)
    return [{"channel": ch, "creatives": lst} for ch, lst in by_ch.items()]


def creative_overview(store, date_from: str, date_to: str, sort: str = "roas") -> dict:
    return {
        "from": date_from, "to": date_to,
        "summary": creatives_summary_range(store, date_from, date_to),
        "creatives": creatives_ranked_range(store, date_from, date_to, top_n=10**6, sort=sort),
        "by_channel": creatives_by_channel_range(store, date_from, date_to, sort=sort),
    }


def _roas(store, cid: str, dfrom: str, dto: str) -> float | None:
    e = _by_creative(store, dfrom, dto).get(cid)
    if not e:
        return None
    cost, sales = e["m"].get("ad_cost", 0.0), e["m"].get("ad_sales", 0.0)
    return round(sales / cost, 2) if cost else None


def creative_fatigue(store, date: str, window: int = 3) -> list[dict]:
    """최근 window 일 ROAS vs 직전 window 일 ROAS 를 비교해 성과 하락 소재를 표시."""
    base = _date.fromisoformat(date)
    r_start = (base - timedelta(days=window - 1)).isoformat()
    p_end = (base - timedelta(days=window)).isoformat()
    p_start = (base - timedelta(days=2 * window - 1)).isoformat()

    out = []
    for cid, e in _by_creative(store, r_start, date).items():
        recent = _roas(store, cid, r_start, date)
        prior = _roas(store, cid, p_start, p_end)
        change = None
        if recent is not None and prior not in (None, 0):
            change = round((recent - prior) / prior * 100, 1)
        out.append({
            "creative_id": cid, "name": e["name"], "channel": e["channel"],
            "recent_roas": recent, "prior_roas": prior, "change_pct": change,
            "fatigued": change is not None and change <= -15,
        })
    return sorted(out, key=lambda x: (x["change_pct"] if x["change_pct"] is not None else 0))


def creative_trend(store, creative_id: str, date_from: str, date_to: str) -> list[dict]:
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="creative"):
        if r["dims"].get("creative_id") != creative_id:
            continue
        m = by_date.setdefault(r["date"], {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    rows = []
    for d in sorted(by_date):
        m = by_date[d]
        cost, sales = m.get("ad_cost", 0.0), m.get("ad_sales", 0.0)
        impr, clicks = m.get("impressions", 0.0), m.get("clicks", 0.0)
        rows.append({"date": d, "ad_cost": cost, "ad_sales": sales,
                     "roas": round(sales / cost, 2) if cost else None,
                     "ctr": round(clicks / impr * 100, 2) if impr else None})
    return rows
