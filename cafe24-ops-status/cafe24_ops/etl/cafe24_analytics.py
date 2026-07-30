"""카페24 접속통계 집계 — facts(c24_*) → 상품 퍼널·검색어·유입처·회원 리포트.

GA4 집계(etl/ga4_site.py)와 역할이 다르다:
  GA4   = 광고 채널별 유입·퍼널·이탈 (사용자 기준, 이벤트 건수)
  카페24 = **상품별 담기율**, 실제 검색어, 상품 조회 vs 매출 (방문 기준)
정의가 달라 숫자가 안 맞는 게 정상이다. 합치지 않고 나란히 본다.
"""
from __future__ import annotations

VISIT_KEYS = {
    "c24_visits": "visits",
    "c24_first_visits": "first_visits",
    "c24_re_visits": "re_visits",
}


def _sum_by_dim(store, date_from, date_to, source, dim_key) -> dict[str, dict]:
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source=source):
        dv = (r.get("dims") or {}).get(dim_key)
        if not dv:
            continue
        m = agg.setdefault(dv, {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    return agg


def _scalars(store, date_from, date_to, source) -> dict[str, float]:
    out: dict[str, float] = {}
    for r in store.get_facts(date_from, date_to, source=source):
        out[r["metric"]] = out.get(r["metric"], 0.0) + float(r["value"])
    return out


# ── 방문 ──────────────────────────────────────────────────────────
def visit_summary(store, date_from: str, date_to: str) -> dict:
    """기간 방문/신규/재방문 합계 + 재방문율."""
    raw = _scalars(store, date_from, date_to, "c24_visit")
    totals = {v: raw.get(k, 0.0) for k, v in VISIT_KEYS.items()}
    days = {r["date"] for r in store.get_facts(date_from, date_to, source="c24_visit")}
    visits = totals["visits"]
    return {
        **totals,
        "re_visit_rate": round(totals["re_visits"] / visits * 100, 1) if visits else None,
        "days": len(days),
    }


def visit_trend(store, date_from: str, date_to: str) -> list[dict]:
    by_date: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="c24_visit"):
        key = VISIT_KEYS.get(r["metric"])
        if key:
            by_date.setdefault(r["date"], {})[key] = float(r["value"])
    return [{"date": d, **{k: by_date[d].get(k) for k in VISIT_KEYS.values()}}
            for d in sorted(by_date)]


# ── 유입 (검색어 / 도메인 / 광고채널) ──────────────────────────────
def _ranked(store, sel_from, sel_to, cmp_from, cmp_to, source, dim, limit) -> list[dict]:
    """방문수 상위 N + 비교기간 대비 증감. 비교기간에 없던 항목은 is_new=True."""
    sel = _sum_by_dim(store, sel_from, sel_to, source, dim)
    cmp = (_sum_by_dim(store, cmp_from, cmp_to, source, dim)
           if cmp_from and cmp_to else {})
    total = sum(m.get("visits", 0.0) for m in sel.values()) or 1.0
    rows = []
    for name, m in sel.items():
        visits = m.get("visits", 0.0)
        prev = (cmp.get(name) or {}).get("visits")
        rows.append({
            "name": name,
            "visits": visits,
            "share": round(visits / total * 100, 1),
            "prev_visits": prev,
            "delta": round((visits - prev) / prev * 100, 1) if prev else None,
            # 비교기간에 아예 없던 것 = 새로 등장한 검색어/유입처 (신호가 크다)
            "is_new": bool(cmp) and prev is None,
        })
    return sorted(rows, key=lambda x: -x["visits"])[:limit]


def search_keywords(store, sel_from, sel_to, cmp_from=None, cmp_to=None,
                    limit: int = 30) -> list[dict]:
    """자연 검색 유입 검색어 TOP N — GA4 에 없는 데이터.
    광고 키워드 리포트(source='keyword')와 나란히 보면
    "광고비 안 쓰고 들어오는 말" vs "돈 내고 사는 말" 을 구분할 수 있다."""
    return _ranked(store, sel_from, sel_to, cmp_from, cmp_to, "c24_keyword", "keyword", limit)


def referrer_domains(store, sel_from, sel_to, cmp_from=None, cmp_to=None,
                     limit: int = 20) -> list[dict]:
    """유입 도메인 TOP N. '참조 도메인 없음' = 직접 유입·앱 내 이동 등."""
    return _ranked(store, sel_from, sel_to, cmp_from, cmp_to, "c24_referrer", "domain", limit)


def ad_paths(store, sel_from, sel_to, cmp_from=None, cmp_to=None,
             limit: int = 20) -> list[dict]:
    """광고 채널별 방문 TOP N — GA4 채널 집계와 교차검증용."""
    return _ranked(store, sel_from, sel_to, cmp_from, cmp_to, "c24_adpath", "ad", limit)


# ── 페이지 ────────────────────────────────────────────────────────
def page_report(store, date_from: str, date_to: str, limit: int = 20) -> list[dict]:
    """페이지 URL 별 조회/방문 + 방문당 조회수.
    방문당 조회수가 1에 가까우면 '한 번 보고 나감'(GA4 이탈률과 같은 방향의 신호)."""
    agg = _sum_by_dim(store, date_from, date_to, "c24_page", "url")
    rows = []
    for url, m in agg.items():
        views, visits = m.get("views", 0.0), m.get("visits", 0.0)
        rows.append({
            "url": url,
            "views": views,
            "visits": visits,
            "first_visits": m.get("first_visits", 0.0),
            "views_per_visit": round(views / visits, 2) if visits else None,
        })
    return sorted(rows, key=lambda x: -x["views"])[:limit]


# ── 상품 퍼널 (조회 → 담기 → 주문) ────────────────────────────────
def product_funnel(store, date_from: str, date_to: str, limit: int = 20,
                   min_views: float = 50) -> list[dict]:
    """상품별 조회 → 장바구니 담기 → 주문 전환.

    GA4 퍼널이 "장바구니 담기"를 병목으로 지목했을 때 **어느 상품 때문인지**를 여기서 본다.
    담기율(cart_rate)은 기간 합계로 다시 계산한다 — API 가 주는 일자별 비율을 그냥
    더하면 안 되기 때문(조회수 가중이 필요).
    조회가 너무 적은 상품은 비율이 요동쳐 오해를 부르므로 min_views 미만은 제외.
    """
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="c24_product"):
        d = r.get("dims") or {}
        no = d.get("product_no")
        if not no:
            continue
        e = agg.setdefault(no, {"product_no": no, "product": d.get("product") or "",
                                "m": {}})
        if not e["product"] and d.get("product"):
            e["product"] = d["product"]
        # cart_rate 는 파생값이라 합산하지 않는다(아래서 다시 계산)
        if r["metric"] == "cart_rate":
            continue
        e["m"][r["metric"]] = e["m"].get(r["metric"], 0.0) + float(r["value"])

    rows = []
    for e in agg.values():
        m = e["m"]
        views = m.get("views", 0.0)
        if views < min_views:
            continue
        adds, orders = m.get("cart_adds", 0.0), m.get("orders", 0.0)
        rows.append({
            "product_no": e["product_no"],
            "product": e["product"],
            "views": views,
            "cart_adds": adds,
            # 조회 → 담기 (여기가 낮으면 가격·옵션·품절·상세페이지 문제)
            "cart_rate": round(adds / views * 100, 2) if views else None,
            "orders": orders,
            # 담기 → 주문 (여기가 낮으면 결제·배송비·재고 문제)
            "order_rate": round(orders / adds * 100, 1) if adds else None,
            # 조회 → 주문 (전체 전환)
            "overall_rate": round(orders / views * 100, 2) if views else None,
            "amount": m.get("amount", 0.0),
        })
    return sorted(rows, key=lambda x: -x["views"])[:limit]


def cart_bottleneck(store, date_from: str, date_to: str, min_views: float = 200) -> dict:
    """퍼널 요약 + **담기율이 유독 낮은 상품** 지목.

    기준: 조회 상위 상품들의 담기율 중위값 대비 절반 미만이면 '이상하게 낮음'.
    (평균이 아니라 중위값 — 한 상품이 튀어도 기준이 흔들리지 않게)
    """
    rows = [r for r in product_funnel(store, date_from, date_to, limit=100,
                                      min_views=min_views)
            if r["cart_rate"] is not None]
    if not rows:
        return {"total_views": 0.0, "total_cart_adds": 0.0, "total_orders": 0.0,
                "cart_rate": None, "order_rate": None, "median_cart_rate": None,
                "laggards": []}
    views = sum(r["views"] for r in rows)
    adds = sum(r["cart_adds"] for r in rows)
    orders = sum(r["orders"] for r in rows)
    rates = sorted(r["cart_rate"] for r in rows)
    mid = len(rates) // 2
    median = rates[mid] if len(rates) % 2 else (rates[mid - 1] + rates[mid]) / 2
    laggards = [r for r in rows if r["cart_rate"] < median / 2]
    return {
        "total_views": views,
        "total_cart_adds": adds,
        "total_orders": orders,
        "cart_rate": round(adds / views * 100, 2) if views else None,
        "order_rate": round(orders / adds * 100, 1) if adds else None,
        "median_cart_rate": round(median, 2),
        # 조회는 많은데 담기율이 중위값의 절반도 안 되는 상품들
        "laggards": sorted(laggards, key=lambda x: -x["views"])[:5],
    }


# ── 회원 / 비회원 ─────────────────────────────────────────────────
def member_split(store, date_from: str, date_to: str) -> dict:
    """회원 vs 비회원 주문수·금액 + 비회원 비중.
    비회원 비중이 높으면 재구매 유도(가입 혜택·CRM)의 여지가 크다는 신호."""
    m = _scalars(store, date_from, date_to, "c24_member")
    mo, no = m.get("member_orders", 0.0), m.get("nonmember_orders", 0.0)
    ma, na = m.get("member_amount", 0.0), m.get("nonmember_amount", 0.0)
    orders, amount = mo + no, ma + na
    return {
        "member_orders": mo, "member_amount": ma,
        "nonmember_orders": no, "nonmember_amount": na,
        "nonmember_order_share": round(no / orders * 100, 1) if orders else None,
        "nonmember_amount_share": round(na / amount * 100, 1) if amount else None,
        "member_aov": round(ma / mo) if mo else None,
        "nonmember_aov": round(na / no) if no else None,
    }
