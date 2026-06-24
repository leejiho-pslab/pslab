"""광고 플랫폼 수집기 (Meta · Google · Naver · Kakao).

Phase 0: mock 으로 채널별 광고비/매출/ROAS 샘플을 생성.
Phase 2: collect_live 에서 각 플랫폼 광고 API 연동.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


def _rng(date: str, salt: str) -> random.Random:
    seed = int(hashlib.sha256(f"{date}:{salt}".encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class AdsCollector(BaseCollector):
    source = "ads"

    def collect_mock(self, date: str) -> list[dict]:
        records: list[dict] = []
        for acc in self.config.sources.ads:
            channel = acc.get("channel", "unknown")
            r = _rng(date, channel)
            cost = float(r.randint(50_000, 800_000))
            roas = round(r.uniform(1.5, 6.0), 2)
            sales = round(cost * roas)
            impressions = float(r.randint(20_000, 300_000))
            clicks = float(r.randint(200, 6_000))
            conversions = float(r.randint(2, 120))
            for metric, value in (
                ("ad_cost", cost),
                ("ad_sales", sales),
                ("impressions", impressions),
                ("clicks", clicks),
                ("conversions", conversions),
            ):
                records.append({
                    "date": date, "source": self.source, "metric": metric,
                    "value": value, "dims": {"channel": channel},
                })
        return records

    def collect_live(self, date: str) -> list[dict]:
        """채널별로 자격증명이 있는 플랫폼만 실수집한다. 없으면 스킵(NotImplementedError)."""
        import os

        records: list[dict] = []
        collected_any = False
        for acc in self.config.sources.ads:
            channel = acc.get("channel")
            if channel == "meta" and os.environ.get("META_ACCESS_TOKEN"):
                from ..clients.ads_meta import MetaAdsClient

                client = MetaAdsClient.from_account(acc)
                try:
                    records += client.fetch_facts(date)
                finally:
                    client.close()
                collected_any = True
            elif channel == "google" and os.environ.get("GOOGLE_ADS_ACCESS_TOKEN"):
                from ..clients.ads_google import GoogleAdsClient

                client = GoogleAdsClient.from_account(acc)
                try:
                    records += client.fetch_facts(date)
                finally:
                    client.close()
                collected_any = True
            # TODO(Phase 2): naver(GFA/SA) / kakao(moment) 커넥터 추가
        if not collected_any:
            raise NotImplementedError(
                "[ads] 광고 플랫폼 자격증명이 없습니다. META/GOOGLE 토큰 설정 시 활성화됩니다."
            )
        return records
