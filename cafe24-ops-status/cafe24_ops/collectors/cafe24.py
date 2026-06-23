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


class Cafe24Collector(BaseCollector):
    source = "cafe24"

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
        return [
            {"date": date, "source": self.source, "metric": k, "value": v}
            for k, v in values.items()
        ]

    def collect_live(self, date: str) -> list[dict]:
        from ..clients import Cafe24Client

        client = Cafe24Client.from_config(self.config)
        try:
            orders = client.list_orders(date, date)
            count = client.count_orders(date, date)
            visitors = client.get_visitor_count(date)       # CAFE24_VISITORS_PATH 설정 시
            signups = client.count_new_customers(date, date)
        finally:
            client.close()
        return (
            orders_to_metrics(date, orders, count)
            + visitor_metrics(date, count, visitors)
            + signup_metrics(date, signups)
        )
