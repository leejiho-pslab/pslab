"""경쟁사 모니터링 수집기 (프로모션 · 광고 · 베스트 · 후기).

Phase 0/1: sources.yaml 의 competitors 목록 기준 mock 생성(목록 비면 빈 결과).
Phase 3: collect_live 에서 공개 페이지 크롤링/검색 API 연동.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

MOCK_PRODUCTS = [
    "레이스 블라우스", "니트 가디건", "데님 팬츠", "H라인 스커트",
    "트위드 자켓", "원피스", "니트 베스트", "하이넥 니트",
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
        """네이버 데이터랩(트렌드) + 검색 API(베스트·프로모션·후기) 실수집.

        데이터랩과 검색을 독립적으로 격리해 한쪽이 실패해도 다른 쪽은 수집한다.
        """
        import logging
        import os

        records: list[dict] = []
        names = [c.get("name") if isinstance(c, dict) else str(c) for c in self.config.sources.competitors]
        names = [n for n in names if n]
        if not (os.environ.get("NAVER_CLIENT_ID") and os.environ.get("NAVER_CLIENT_SECRET")):
            raise NotImplementedError(
                "[competitor] 자격증명 없음 — NAVER_CLIENT_ID/SECRET 설정 시 검색 트렌드부터 수집됩니다."
            )

        # ① 데이터랩 검색 트렌드 (자사 브랜드 포함 → 점유 비교)
        brand = (self.config.sources.shop or {}).get("brand")
        track = ([brand] if brand else []) + [n for n in names if n != brand]
        if track:
            from ..clients.naver_datalab import NaverDataLabClient

            client = NaverDataLabClient.from_env()
            try:
                records += client.fetch_search_facts(date, date, track)
            except Exception as e:  # noqa: BLE001 - 데이터랩 실패가 검색 수집을 막지 않게
                logging.warning("[competitor] 데이터랩 트렌드 실패: %s", e)
            finally:
                client.close()

        # ② 검색 API → 베스트 상품 / 프로모션 / 당일 후기 (경쟁사 단위 격리는 클라이언트 내부)
        if names:
            from ..clients.naver_search import NaverSearchClient

            search = NaverSearchClient.from_env()
            try:
                records += search.fetch_competitor_facts(date, names)
            finally:
                search.close()
        # TODO(Phase 3+): 광고 소재(메타 Ad Library 등) / 평점 크롤링
        return records
