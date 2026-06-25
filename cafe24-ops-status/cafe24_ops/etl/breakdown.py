"""차원별 집계 — 디바이스/카테고리/베스트/CRM/신규·재구매.

facts 테이블의 dims 를 그룹핑해 일별 운영 데이터 상세를 만든다.
(mock 모드에서 생성되는 차원 팩트를 기준으로 동작하며, live 연동은 Phase 2~ 에서 채운다)
"""
from __future__ import annotations


def _sum_by_dim(store, date: str, metric: str, dim_key: str) -> dict[str, float]:
    agg: dict[str, float] = {}
    for r in store.get_facts(date, date, metric=metric):
        k = r["dims"].get(dim_key)
        if k is None:
            continue
        agg[k] = agg.get(k, 0.0) + float(r["value"])
    return agg


def _ranked(agg: dict[str, float]) -> list[dict]:
    return [{"key": k, "value": v} for k, v in sorted(agg.items(), key=lambda x: -x[1])]


def device_breakdown(store, date: str) -> list[dict]:
    return _ranked(_sum_by_dim(store, date, "device_sales", "device"))


def category_breakdown(store, date: str) -> list[dict]:
    return _ranked(_sum_by_dim(store, date, "category_sales", "category"))


def best_products(store, date: str, top_n: int = 10) -> list[dict]:
    return _ranked(_sum_by_dim(store, date, "product_sales", "product"))[:top_n]


def crm_counts(store, date: str) -> dict[str, float]:
    return _sum_by_dim(store, date, "crm_count", "channel")


def new_returning_trend(store, date_from: str, date_to: str) -> list[dict]:
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, metric="customer_sales"):
        slot = by_date.setdefault(r["date"], {"new": 0.0, "returning": 0.0})
        t = r["dims"].get("customer_type")
        if t in slot:
            slot[t] += float(r["value"])
    return [{"date": d, **v} for d, v in sorted(by_date.items())]
