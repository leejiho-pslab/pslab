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
MOCK_AD_TITLES = [
    "여름 시즌오프 최대 50%", "신상 입고 기념 쿠폰팩", "리뷰 이벤트 적립",
    "베스트 단독 특가", "오늘만 무료배송", "신규회원 10% 할인",
]
AD_PLATFORMS = ["meta", "google"]


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
            # 네이버 검색량
            records.append({"date": date, "source": self.source, "metric": "naver_search_volume",
                            "value": float(r.randint(500, 15_000)), "dims": {"competitor": name}})
            # 베스트 상품 TOP3 (일자별로 변동 → 신규 진입/순위 변동 분석용)
            for rank, product in enumerate(r.sample(MOCK_PRODUCTS, 3), start=1):
                records.append({"date": date, "source": self.source, "metric": "bestseller",
                                "value": float(rank),
                                "dims": {"competitor": name, "product": product}})
            # 광고 소재 (메타/구글 등 공개 영역)
            for platform in r.sample(AD_PLATFORMS, r.randint(1, len(AD_PLATFORMS))):
                title = r.choice(MOCK_AD_TITLES)
                records.append({"date": date, "source": self.source, "metric": "ad_creative",
                                "value": float(r.randint(10_000, 200_000)),
                                "dims": {"competitor": name, "platform": platform, "title": title}})
        return records

    def collect_live(self, date: str) -> list[dict]:
        # TODO(Phase 3): 경쟁사 공개정보 크롤링/검색 연동
        raise NotImplementedError("[competitor] 경쟁사 모니터링 연동은 Phase 3에서 구현됩니다.")
