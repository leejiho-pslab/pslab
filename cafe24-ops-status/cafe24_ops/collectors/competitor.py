"""경쟁사 모니터링 수집기 (프로모션 · 광고 · 베스트 · 후기).

Phase 0/1: sources.yaml 의 competitors 목록 기준 mock 생성(목록 비면 빈 결과).
Phase 3: collect_live 에서 공개 페이지 크롤링/검색 API 연동.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

MOCK_PRODUCTS = [
    "베이직 후디", "리커버리 슬리퍼", "트래블 파우치", "윈드브레이커",
    "넥쿠션", "조거 팬츠", "에코백", "캡 모자",
]


def _rng(key: str) -> random.Random:
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class CompetitorCollector(BaseCollector):
    source = "competitor"

    def collect_mock(self, date: str) -> list[dict]:
        records: list[dict] = []
        for comp in self.config.sources.competitors:
            name = comp.get("name", "unknown") if isinstance(comp, dict) else str(comp)
            r = _rng(f"{date}:{name}")
            scalars = {
                "active_promotions": float(r.randint(0, 6)),
                "new_reviews": float(r.randint(0, 50)),
                "avg_rating": round(r.uniform(3.5, 4.9), 1),
                "ad_count": float(r.randint(0, 12)),
            }
            for metric, value in scalars.items():
                records.append({"date": date, "source": self.source, "metric": metric,
                                "value": value, "dims": {"competitor": name}})
            # 베스트 상품 TOP3
            for rank, product in enumerate(r.sample(MOCK_PRODUCTS, 3), start=1):
                records.append({"date": date, "source": self.source, "metric": "bestseller",
                                "value": float(rank),
                                "dims": {"competitor": name, "product": product}})
        return records

    def collect_live(self, date: str) -> list[dict]:
        # TODO(Phase 3): 경쟁사 공개정보 크롤링/검색 연동
        raise NotImplementedError("[competitor] 경쟁사 모니터링 연동은 Phase 3에서 구현됩니다.")
