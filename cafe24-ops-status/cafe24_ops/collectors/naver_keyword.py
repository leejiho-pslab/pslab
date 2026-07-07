"""네이버SA 키워드별(파워링크/플레이스) 성과 수집기 (광고 히스토리 대시보드용).

Phase 0: mock 으로 키워드별 노출/클릭/비용/전환을 일자별 생성(결정적).
Phase 1: collect_live 에서 NaverSearchAdClient.fetch_keyword_facts 연동(캠페인→광고그룹→키워드).
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

# (channel, keyword, adgroup)
MOCK_KEYWORDS = [
    ("naver_powerlink", "keek 목베개", "PL_neck_1"),
    ("naver_powerlink", "여행 목베개 추천", "PL_neck_1"),
    ("naver_powerlink", "keek 후드집업", "PL_hoodie_1"),
    ("naver_place", "keek 매장", "PL_place_1"),
]


def _rng(key: str) -> random.Random:
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class NaverKeywordCollector(BaseCollector):
    source = "keyword"

    def collect_mock(self, date: str) -> list[dict]:
        records: list[dict] = []
        for channel, keyword, adgroup in MOCK_KEYWORDS:
            r = _rng(f"{date}:{keyword}")
            impressions = float(r.randint(500, 20_000))
            clicks = float(r.randint(5, 600))
            cost = float(r.randint(5_000, 150_000))
            conv = float(r.randint(0, 20))
            dims = {"channel": channel, "keyword": keyword, "adgroup": adgroup}
            for metric, value in (
                ("impressions", impressions),
                ("clicks", clicks),
                ("ad_cost", cost),
                ("conversions", conv),
            ):
                records.append({"date": date, "source": self.source,
                                "metric": metric, "value": value, "dims": dims})
        return records

    def collect_live(self, date: str) -> list[dict]:
        import os

        if not os.environ.get("NAVER_SA_API_KEY"):
            raise NotImplementedError("[keyword] 네이버SA 자격증명이 없습니다.")

        from ..clients.ads_naver import NaverSearchAdClient

        acc = next((a for a in self.config.sources.ads if a.get("channel") == "naver"), {})
        client = NaverSearchAdClient.from_account(acc)
        try:
            facts = client.fetch_keyword_facts(date)
            if client.last_partial_error:
                # 부분 실패를 파이프라인에 알림 → 경고 승격 + 기존 데이터 보존(upsert만)
                self.partial_errors["naver_stats"] = client.last_partial_error
            return facts
        finally:
            client.close()
