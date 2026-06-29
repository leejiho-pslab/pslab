"""카페24 Admin API 수집기.

- mock: 기존 keek 운영 대시보드와 동일한 KPI 셋을 일자별로 생성 (결정적)
- live: 카페24 Admin API(주문)를 호출해 매출/주문수/객단가를 산출

방문자·전환율 등 주문 외 지표는 별도 통계/연동이 필요하므로 Phase 1 에서는
주문 기반 지표(gross_sales, order_count, aov)부터 실연동한다.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


def _rng(date: str) -> random.Random:
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def order_amount(order: dict) -> float:
    """주문 1건의 결제 금액을 안전하게 추출한다 (API 버전별 필드 차이 대응)."""
    for key in ("payment_amount", "order_price_amount"):
        v = order.get(key)
        if v not in (None, ""):
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    aoa = order.get("actual_order_amount") or {}
    for key in ("payment_amount", "order_amount"):
        v = aoa.get(key)
        if v not in (None, ""):
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return 0.0


def orders_to_metrics(date: str, orders: list[dict], order_count: int | None = None) -> list[dict]:
    """주문 목록 → 표준 metric 레코드(gross_sales/order_count/aov)."""
    gross = sum(order_amount(o) for o in orders)
    count = order_count if order_count is not None else len(orders)
    aov = (gross / count) if count else 0.0
    values = {
        "gross_sales": float(gross),
        "order_count": float(count),
        "aov": round(aov, 2),
    }
    return [
        {"date": date, "source": "cafe24", "metric": k, "value": v}
        for k, v in values.items()
    ]


def visitor_metrics(date: str, order_count: int, visitors: int | None) -> list[dict]:
    """방문자수가 있으면 visitors + conversion_rate(구매전환율, %)를 만든다."""
    if not visitors or visitors <= 0:
        return []
    return [
        {"date": date, "source": "cafe24", "metric": "visitors", "value": float(visitors)},
        {"date": date, "source": "cafe24", "metric": "conversion_rate",
         "value": round(order_count / visitors * 100, 2)},
    ]


def signup_metrics(date: str, new_signups: int | None) -> list[dict]:
    if new_signups is None:
        return []
    return [{"date": date, "source": "cafe24", "metric": "new_signups", "value": float(new_signups)}]


def order_breakdowns(date: str, orders: list[dict]) -> list[dict]:
    """실주문 → 디바이스/신규·재구매 매출 차원 팩트 (추가 scope 불필요).

    - 디바이스: order_from_mobile == "T" → mobile, else pc
    - 신규/재구매: first_order == "F" → 재구매(returning), 그 외(T·null·게스트/마켓) → 신규(new)
      (마켓/비회원 주문은 first_order 가 null 이라 '신규'로 집계 — 합계가 매출과 일치)
    """
    dev = {"mobile": 0.0, "pc": 0.0}
    cust = {"new": 0.0, "returning": 0.0}
    for o in orders:
        amt = order_amount(o)
        dev["mobile" if o.get("order_from_mobile") == "T" else "pc"] += amt
        cust["returning" if o.get("first_order") == "F" else "new"] += amt
    out = []
    for d, v in dev.items():
        out.append({"date": date, "source": "cafe24", "metric": "device_sales",
                    "value": round(v, 2), "dims": {"device": d}})
    for c, v in cust.items():
        out.append({"date": date, "source": "cafe24", "metric": "customer_sales",
                    "value": round(v, 2), "dims": {"customer_type": c}})
    return out


def _item_amount(it: dict) -> float:
    """주문 품목 결제금액 — 가능한 필드를 순서대로 시도(가격×수량 폴백)."""
    for k in ("payment_amount", "product_price_amount", "actual_payment_amount"):
        v = it.get(k)
        if v not in (None, ""):
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    try:
        qty = float(it.get("quantity", 0) or 0)
        price = float(it.get("product_price", it.get("price", 0)) or 0)
        opt = float(it.get("option_price", 0) or 0)
        return (price + opt) * qty
    except (TypeError, ValueError):
        return 0.0


def best_products(date: str, orders: list[dict], top_n: int = 10) -> list[dict]:
    """주문 items 집계 → 베스트상품(product_sales) 상위 N. embed=items 필요."""
    agg: dict[str, float] = {}
    for o in orders:
        for it in (o.get("items") or []):
            name = it.get("product_name") or it.get("product_name_default") or it.get("product_code")
            if not name:
                continue
            agg[name] = agg.get(name, 0.0) + _item_amount(it)
    top = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
    return [{"date": date, "source": "cafe24", "metric": "product_sales",
             "value": round(v, 2), "dims": {"product": name}} for name, v in top]


MOCK_PRODUCTS = [
    "keek Pillow", "Filovely Basic Windbreaker", "keek Recovery Slipper",
    "keek Travel Pouch", "HOODIE Oversfit", "keek Neck Cushion",
    "Filovely Logo Tee", "keek Pillow U V2", "Recovery Band", "Travel Organizer",
    "keek Hoodie Zip-up", "Filovely Utility Vest",
]
MOCK_CRM_CHANNELS = ["sms", "alimtalk", "kakao", "reviews"]


class Cafe24Collector(BaseCollector):
    source = "cafe24"

    def _category_names(self) -> list[str]:
        for g in self.config.metrics.daily_groups:
            if g.get("name") == "카테고리 매출":
                return list(g.get("metrics", []))
        return ["All", "BEST", "NEW"]

    def collect_mock(self, date: str) -> list[dict]:
        r = _rng(date)
        visitors = r.randint(800, 2500)
        conv = r.uniform(0.008, 0.020)              # 구매전환율
        order_count = max(1, round(visitors * conv))
        aov = r.randint(80_000, 150_000)            # 객단가
        gross_sales = order_count * aov
        ad_cost = round(gross_sales * r.uniform(0.05, 0.40))
        ad_sales = round(gross_sales * r.uniform(0.20, 0.60))

        values = {
            "gross_sales": float(gross_sales),
            "ad_sales": float(ad_sales),
            "order_count": float(order_count),
            "aov": float(aov),
            "conversion_rate": round(order_count / visitors * 100, 2),  # %
            "visitors": float(visitors),
            "ad_cost": float(ad_cost),
            "ad_cost_ratio": round(ad_cost / gross_sales * 100, 2),     # %
        }
        facts = [
            {"date": date, "source": self.source, "metric": k, "value": v}
            for k, v in values.items()
        ]
        facts += self._dimensional_mock(date, r, gross_sales, order_count)
        return facts

    def _dimensional_mock(self, date, r, gross_sales, order_count) -> list[dict]:
        """일별 운영 데이터 상세용 차원 팩트(디바이스/신규·재구매/카테고리/베스트/CRM)."""
        out: list[dict] = []

        def f(metric, value, **dims):
            out.append({"date": date, "source": self.source, "metric": metric,
                        "value": float(value), "dims": dims})

        # 디바이스 매출 비중
        mobile = round(gross_sales * r.uniform(0.55, 0.80))
        f("device_sales", mobile, device="mobile")
        f("device_sales", gross_sales - mobile, device="pc")

        # 신규 vs 재구매 매출
        new_sales = round(gross_sales * r.uniform(0.30, 0.60))
        f("customer_sales", new_sales, customer_type="new")
        f("customer_sales", gross_sales - new_sales, customer_type="returning")

        # 카테고리 매출
        for cat in self._category_names():
            f("category_sales", round(gross_sales * r.uniform(0.05, 0.45)), category=cat)

        # 베스트 상품
        for name in MOCK_PRODUCTS:
            f("product_sales", r.randint(200_000, 3_000_000), product=name)

        # CRM 발송/후기
        for ch in MOCK_CRM_CHANNELS:
            base = order_count * r.uniform(0.5, 3.0)
            f("crm_count", round(base), channel=ch)

        return out

    def collect_live(self, date: str) -> list[dict]:
        from ..clients import Cafe24Client
        from ..store import Store

        # DB 에 영속된 토큰을 최우선 사용(무인 환경 토큰 회전 대응). 없으면 env 폴백.
        kv = Store(self.config.data_dir)
        try:
            access = kv.get_kv("cafe24_access_token")
            refresh = kv.get_kv("cafe24_refresh_token")
            client = Cafe24Client.from_config(
                self.config, access_override=access, refresh_override=refresh
            )
            try:
                orders = client.list_orders(date, date)
                count = client.count_orders(date, date)
                visitors = client.get_visitor_count(date)    # CAFE24_VISITORS_PATH 설정 시
                signups = client.count_new_customers(date, date)
                reviews = client.count_reviews(date, date)   # 상품후기 수(board 4)
                soldout = client.count_soldout()             # 현재 품절 상품 수(스냅샷)
            finally:
                client.close()
            # 갱신(회전)되었을 수 있는 토큰을 DB 에 저장 → 다음 실행이 이어받음
            kv.set_kv("cafe24_access_token", client.access_token)
            if client.refresh_token:
                kv.set_kv("cafe24_refresh_token", client.refresh_token)
        finally:
            kv.close()
        extra = []
        if reviews is not None:
            extra.append({"date": date, "source": "cafe24", "metric": "crm_count",
                          "value": float(reviews), "dims": {"channel": "reviews"}})
        if soldout is not None:
            extra.append({"date": date, "source": "cafe24", "metric": "soldout_count",
                          "value": float(soldout)})
        return (
            orders_to_metrics(date, orders, count)
            + visitor_metrics(date, count, visitors)
            + signup_metrics(date, signups)
            + order_breakdowns(date, orders)
            + best_products(date, orders)
            + extra
        )
