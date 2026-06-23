"""경쟁사 모니터링 수집기 (프로모션 · 광고 · 베스트 · 후기).

Phase 0: sources.yaml 의 competitors 목록 기준으로 mock 샘플 생성(목록이 비면 빈 결과).
Phase 3: collect_live 에서 공개 페이지 크롤링/검색 API 연동.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


class CompetitorCollector(BaseCollector):
    source = "competitor"

    def collect_mock(self, date: str) -> list[dict]:
        records: list[dict] = []
        for comp in self.config.sources.competitors:
            name = comp.get("name", "unknown") if isinstance(comp, dict) else str(comp)
            seed = int(hashlib.sha256(f"{date}:{name}".encode()).hexdigest(), 16) % (2**32)
            r = random.Random(seed)
            for metric, value in (("active_promotions", float(r.randint(0, 5))),
                                  ("new_reviews", float(r.randint(0, 40)))):
                records.append({
                    "date": date, "source": self.source, "metric": metric,
                    "value": value, "dims": {"competitor": name},
                })
        return records

    def collect_live(self, date: str) -> list[dict]:
        # TODO(Phase 3): 경쟁사 공개정보 크롤링/검색 연동
        raise NotImplementedError("[competitor] 경쟁사 모니터링 연동은 Phase 3에서 구현됩니다.")
