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
        # TODO(Phase 2): Meta/Google/Naver/Kakao 광고 API 연동
        raise NotImplementedError("[ads] 광고 플랫폼 API 연동은 Phase 2에서 구현됩니다.")
