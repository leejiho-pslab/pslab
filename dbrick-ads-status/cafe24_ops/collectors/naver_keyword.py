"""네이버 검색광고 키워드 리포트 수집기 (광고 히스토리 — 네이버 검색 탭용).

파워링크 캠페인은 키워드별, 플레이스 등은 광고그룹별로 광고비/노출/클릭/전환을 모은다.
source='naver_keyword' facts 로 저장하고, 대시보드는 광고비 소진 기준으로 정렬해 보여준다.

mock 모드: 결정적 샘플 키워드 리포트를 생성(연동 전 전체 흐름 검증).
live 모드: NAVER_SA 자격증명이 있을 때만 실수집, 없으면 스킵(NotImplementedError).
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

# (키워드, 캠페인, 광고그룹, 채널)
MOCK_KEYWORDS = [
    ("주방인테리어", "파워링크 - 단일 소재형", "파워링크_키워드", "naver_powerlink"),
    ("욕실인테리어", "파워링크 - 단일 소재형", "파워링크_키워드", "naver_powerlink"),
    ("용인수지인테리어", "파워링크 - 단일 소재형", "파워링크_지역별", "naver_powerlink"),
    ("디브릭인테리어", "파워링크-회사명", "회사 / 상호명", "naver_powerlink"),
    ("분당인테리어잘하는곳", "파워링크 - 단일 소재형", "파워링크_지역별", "naver_powerlink"),
    ("-", "플레이스#2_all day", "플레이스#2_광고그룹#1", "naver_place"),
    ("-", "플레이스#1_감성넷 세팅", "플레이스_큰평수", "naver_place"),
]


def _rng(key: str) -> random.Random:
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class NaverKeywordCollector(BaseCollector):
    source = "naver_keyword"

    def collect_mock(self, date: str) -> list[dict]:
        records: list[dict] = []
        for kw, camp, ag, channel in MOCK_KEYWORDS:
            r = _rng(f"{date}:{kw}:{ag}")
            cost = float(r.randint(3_000, 900_000))
            impr = float(r.randint(10, 15_000))
            clicks = float(r.randint(1, 600))
            conv = float(r.randint(0, 8))
            sales = float(round(conv * r.randint(0, 200_000)))
            dims = {"keyword": kw, "campaign": camp, "adgroup": ag, "channel": channel}
            for metric, value in (
                ("ad_cost", cost), ("impressions", impr), ("clicks", clicks),
                ("conversions", conv), ("ad_sales", sales),
            ):
                records.append({"date": date, "source": self.source,
                                "metric": metric, "value": value, "dims": dims})
        return records

    def collect_live(self, date: str) -> list[dict]:
        """네이버 SA 키워드 리포트. 자격증명 없으면 스킵."""
        import os

        if not os.environ.get("NAVER_SA_API_KEY"):
            raise NotImplementedError("[naver_keyword] 네이버 SA 자격증명이 없습니다(설정 시 키워드 리포트 수집).")
        from ..clients.ads_naver import NaverSearchAdClient

        acc = next((a for a in self.config.sources.ads if a.get("channel") == "naver"), {})
        client = NaverSearchAdClient.from_account(acc)
        try:
            return client.fetch_keyword_facts(date)
        finally:
            client.close()
