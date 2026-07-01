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


def _scalar(store, date: str, metric: str) -> float | None:
    """dims 없는 단일 지표 합(없으면 None)."""
    rows = store.get_facts(date, date, metric=metric)
    if not rows:
        return None
    return sum(float(r["value"]) for r in rows)


def visitor_detail(store, date: str) -> dict:
    """방문자 상세 — 전체/신규/재방문·재방문율·신규가입수·회원가입율. 없는 값은 None.

    신규/재방문은 GA4 newVsReturning(visitors_new/returning), 가입율은 new_signups/visitors.
    """
    total = _scalar(store, date, "visitors")
    new = _scalar(store, date, "visitors_new")
    ret = _scalar(store, date, "visitors_returning")
    signups = _scalar(store, date, "new_signups")
    seg_total = (new or 0) + (ret or 0)
    return {
        "visitors": total,
        "new": new,
        "returning": ret,
        "return_rate": round(ret / seg_total * 100, 1) if ret is not None and seg_total else None,
        "signups": signups,
        "signup_rate": round(signups / total * 100, 2) if signups is not None and total else None,
    }


def device_breakdown(store, date: str) -> list[dict]:
    return _ranked(_sum_by_dim(store, date, "device_sales", "device"))


def device_perf(store, date: str) -> list[dict]:
    """디바이스(모바일/PC)별 매출·주문건수·객단가·매출비중 — metrics.yaml 모바일(결제)/PC 그룹."""
    sales = _sum_by_dim(store, date, "device_sales", "device")
    counts = _sum_by_dim(store, date, "device_order_count", "device")
    total = sum(sales.values())
    out = []
    for d in ("mobile", "pc"):
        s = sales.get(d, 0.0)
        c = counts.get(d, 0.0)
        out.append({
            "device": d,
            "sales": s,
            "order_count": c,
            "aov": round(s / c, 2) if c else None,
            "share": round(s / total * 100, 1) if total else None,
        })
    return out


def category_breakdown(store, date: str) -> list[dict]:
    return _ranked(_sum_by_dim(store, date, "category_sales", "category"))


def best_products(store, date: str, top_n: int = 10) -> list[dict]:
    return _ranked(_sum_by_dim(store, date, "product_sales", "product"))[:top_n]


def crm_counts(store, date: str) -> dict[str, float]:
    """CRM 채널별 발송/후기 수(문자/알림톡/카카오/후기). 신규가입수는 방문자 상세로 이동."""
    return _sum_by_dim(store, date, "crm_count", "channel")


def visitor_trend(store, date_from: str, date_to: str) -> list[dict]:
    """일별 방문자 추이 — 전체방문/신규방문/재방문(그래프용). 값 없는 날은 키 생략."""
    by_date: dict[str, dict] = {}
    for metric, key in (("visitors", "visitors"), ("visitors_new", "new"),
                        ("visitors_returning", "returning")):
        for r in store.get_facts(date_from, date_to, metric=metric):
            slot = by_date.setdefault(r["date"], {"date": r["date"]})
            slot[key] = slot.get(key, 0.0) + float(r["value"])
    return [by_date[d] for d in sorted(by_date)]


def new_returning_trend(store, date_from: str, date_to: str) -> list[dict]:
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, metric="customer_sales"):
        slot = by_date.setdefault(r["date"], {"new": 0.0, "returning": 0.0})
        t = r["dims"].get("customer_type")
        if t in slot:
            slot[t] += float(r["value"])
    return [{"date": d, **v} for d, v in sorted(by_date.items())]
