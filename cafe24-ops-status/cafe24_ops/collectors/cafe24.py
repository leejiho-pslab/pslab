"""카페24 Admin API 수집기.

Phase 0: mock 모드에서 기존 keek 운영 대시보드와 동일한 KPI 셋을 일자별로 생성한다.
Phase 1: collect_live 에서 카페24 Admin API(주문/상품/방문/회원)를 호출해 동일 형태로 반환.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


def _rng(date: str) -> random.Random:
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


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
        # TODO(Phase 1): 카페24 Admin API 연동
        #   - OAuth access_token 으로 /api/v2/admin/orders, /products, /customers 등 호출
        #   - 응답을 위 mock 과 동일한 {date,source,metric,value} 형태로 변환
        raise NotImplementedError("[cafe24] Admin API 연동은 Phase 1에서 구현됩니다.")
