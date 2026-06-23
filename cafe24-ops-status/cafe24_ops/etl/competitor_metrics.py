"""경쟁사 모니터링 집계 — 경쟁사별 스냅샷 + 활동 추세.

facts(source='competitor') 의 competitor 차원을 모아 프로모션/광고/후기/평점/베스트를
경쟁사별로 정리한다.
"""
from __future__ import annotations

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
