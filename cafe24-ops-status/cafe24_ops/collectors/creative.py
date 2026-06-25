"""DA 광고 소재별 성과 수집기 (광고 히스토리 대시보드용).

Phase 0/1: mock 으로 소재별 노출/클릭/전환/비용/매출을 일자별 생성(결정적).
Phase 3: collect_live 에서 채널 소재 리포트 API 연동.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

# (creative_id, 소재명, 채널)
MOCK_CREATIVES = [
    ("AD-001", "keek Pillow 후킹", "meta"),
    ("AD-002", "Recovery 슬리퍼 할인", "meta"),
    ("AD-003", "Travel 파우치 신상", "google"),
    ("AD-004", "Filovely 윈드브레이커", "google"),
    ("AD-005", "HOODIE 가을 무드", "naver"),
    ("AD-006", "Neck Cushion UGC", "kakao"),
]


def _rng(key: str) -> random.Random:
    seed = int(hashlib.sha256(key.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class CreativeCollector(BaseCollector):
    source = "creative"

    def collect_mock(self, date: str) -> list[dict]:
        records: list[dict] = []
        for cid, name, channel in MOCK_CREATIVES:
            r = _rng(f"{date}:{cid}")
            impressions = float(r.randint(5_000, 80_000))
            clicks = float(r.randint(50, 2_500))
            conversions = float(r.randint(0, 90))
            cost = float(r.randint(30_000, 400_000))
            sales = float(round(cost * r.uniform(0.8, 6.0)))
            dims = {"creative_id": cid, "name": name, "channel": channel}
            for metric, value in (
                ("impressions", impressions),
                ("clicks", clicks),
                ("conversions", conversions),
                ("ad_cost", cost),
                ("ad_sales", sales),
            ):
                records.append({"date": date, "source": self.source,
                                "metric": metric, "value": value, "dims": dims})
        return records

    def collect_live(self, date: str) -> list[dict]:
        # TODO(Phase 3): DA 채널 소재별 리포트 연동
        raise NotImplementedError("[creative] 소재별 성과 연동은 Phase 3에서 구현됩니다.")
