"""경쟁사 모니터링 집계 — 경쟁사별 스냅샷 + 활동 추세.

facts(source='competitor') 의 competitor 차원을 모아 프로모션/광고/후기/평점/베스트를
경쟁사별로 정리한다.
"""
from __future__ import annotations

from datetime import date as _date
from datetime import timedelta

SCALAR_METRICS = ("active_promotions", "new_reviews", "avg_rating", "ad_count")


def competitor_snapshot(store, date: str) -> list[dict]:
    comps: dict[str, dict] = {}
    for r in store.get_facts(date, date, source="competitor"):
        name = r["dims"].get("competitor")
        if not name:
            continue
        c = comps.setdefault(name, {"name": name, "best_products": []})
        if r["metric"] == "bestseller":
            c["best_products"].append((int(r["value"]), r["dims"].get("product")))
        elif r["metric"] in SCALAR_METRICS:
            c[r["metric"]] = r["value"]
    out = []
    for c in comps.values():
        c["best_products"] = [p for _, p in sorted(c["best_products"])]
        for m in SCALAR_METRICS:
            c.setdefault(m, None)
        out.append(c)
    return sorted(out, key=lambda x: x["name"])


def competitor_trend(store, date_from: str, date_to: str) -> list[dict]:
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="competitor"):
        if r["metric"] not in ("active_promotions", "new_reviews", "ad_count"):
            continue
        d = by_date.setdefault(r["date"], {"active_promotions": 0.0, "new_reviews": 0.0, "ad_count": 0.0})
        d[r["metric"]] += float(r["value"])
    return [{"date": k, **v} for k, v in sorted(by_date.items())]


def naver_search(store, date: str) -> list[dict]:
    out = []
    for r in store.get_facts(date, date, source="competitor"):
        if r["metric"] == "naver_search_volume":
            out.append({"competitor": r["dims"].get("competitor"), "volume": r["value"]})
    return sorted(out, key=lambda x: -x["volume"])


def naver_trend(store, date_from: str, date_to: str) -> dict:
    comps: set[str] = set()
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="competitor"):
        if r["metric"] != "naver_search_volume":
            continue
        name = r["dims"].get("competitor")
        comps.add(name)
        by_date.setdefault(r["date"], {})[name] = r["value"]
    names = sorted(comps)
    rows = [{"date": d, **{n: by_date[d].get(n, 0.0) for n in names}} for d in sorted(by_date)]
    return {"competitors": names, "rows": rows}


def competitor_ad_creatives(store, date: str) -> list[dict]:
    res: dict[str, list] = {}
    for r in store.get_facts(date, date, source="competitor"):
        if r["metric"] != "ad_creative":
            continue
        name = r["dims"].get("competitor")
        res.setdefault(name, []).append({
            "platform": r["dims"].get("platform"),
            "title": r["dims"].get("title"),
            "impressions": r["value"],
        })
    return [{"name": k, "creatives": v} for k, v in sorted(res.items())]


def _bestseller_ranks(store, date: str) -> dict[str, dict[str, int]]:
    res: dict[str, dict[str, int]] = {}
    for r in store.get_facts(date, date, source="competitor"):
        if r["metric"] == "bestseller":
            res.setdefault(r["dims"].get("competitor"), {})[r["dims"].get("product")] = int(r["value"])
    return res


def bestseller_changes(store, date: str) -> list[dict]:
    """베스트 상품의 신규 진입 / 순위 변동을 전일 대비로 분석."""
    prev = (_date.fromisoformat(date) - timedelta(days=1)).isoformat()
    today = _bestseller_ranks(store, date)
    yest = _bestseller_ranks(store, prev)
    out = []
    for name, prods in today.items():
        y = yest.get(name, {})
        new_entries = [p for p in prods if p not in y]
        changes = []
        for product, rank in prods.items():
            if product in y and y[product] != rank:
                changes.append({"product": product, "prev_rank": y[product],
                                "cur_rank": rank, "delta": y[product] - rank})
        out.append({"name": name, "new_entries": new_entries,
                    "rank_changes": sorted(changes, key=lambda x: -abs(x["delta"]))})
    return sorted(out, key=lambda x: x["name"])
