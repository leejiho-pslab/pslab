"""DA 광고 소재별 성과 수집기 (광고 히스토리 대시보드용).

Phase 0: mock 으로 소재 몇 건의 노출/클릭/전환 샘플 생성.
Phase 3: collect_live 에서 채널 소재 리포트 API 연동.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


class CreativeCollector(BaseCollector):
    source = "creative"

    def collect_mock(self, date: str) -> list[dict]:
        seed = int(hashlib.sha256(f"{date}:creative".encode()).hexdigest(), 16) % (2**32)
        r = random.Random(seed)
        records: list[dict] = []
        for i in range(1, 4):  # 샘플 소재 3건
            cid = f"AD-{i:03d}"
            impressions = float(r.randint(5_000, 50_000))
            clicks = float(r.randint(50, 1_500))
            conversions = float(r.randint(0, 60))
            for metric, value in (("impressions", impressions),
                                  ("clicks", clicks),
                                  ("conversions", conversions)):
                records.append({
                    "date": date, "source": self.source, "metric": metric,
                    "value": value, "dims": {"creative_id": cid},
                })
        return records

    def collect_live(self, date: str) -> list[dict]:
        # TODO(Phase 3): DA 채널 소재별 리포트 연동
        raise NotImplementedError("[creative] 소재별 성과 연동은 Phase 3에서 구현됩니다.")
