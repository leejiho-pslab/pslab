"""GA4 사이트 분석 수집기 — 방문자 · 세션 · 페이지뷰 · 평균 체류시간.

디브릭은 자사몰(카페24)이 없어 방문 지표의 원천이 GA4 뿐이다. 광고 성과와 나란히
보도록 사이트 지표를 일자별 facts(source='ga4_site')로 적재한다.

활성화: GA4_PROPERTY_ID + GOOGLE_APPLICATION_CREDENTIALS_JSON (광고 전환 대체와 동일 자격증명).
없으면 NotImplementedError 로 스킵(파이프라인의 점진적 롤아웃 패턴).
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


def _rng(date: str, salt: str) -> random.Random:
    seed = int(hashlib.sha256(f"{date}:{salt}".encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class Ga4SiteCollector(BaseCollector):
    source = "ga4_site"

    def collect_mock(self, date: str) -> list[dict]:
        r = _rng(date, "ga4_site")
        visitors = float(r.randint(300, 1200))
        sessions = round(visitors * r.uniform(1.1, 1.5))
        page_views = round(sessions * r.uniform(2.0, 4.5))
        avg_duration = round(r.uniform(45, 240), 1)  # 초
        return [
            {"date": date, "source": self.source, "metric": k, "value": v}
            for k, v in (
                ("site_visitors", visitors),
                ("site_sessions", float(sessions)),
                ("site_page_views", float(page_views)),
                ("site_avg_duration", avg_duration),
            )
        ]

    def collect_live(self, date: str) -> list[dict]:
        from ..clients.ga4 import GA4Client

        client = GA4Client.from_env()
        if client is None:
            raise NotImplementedError(
                "[ga4_site] GA4 자격증명이 없습니다. GA4_PROPERTY_ID + "
                "GOOGLE_APPLICATION_CREDENTIALS_JSON 설정 시 활성화됩니다."
            )
        try:
            metrics = client.daily_site_metrics(date)
        finally:
            client.close()
        if not metrics:
            return []
        return [
            {"date": date, "source": self.source, "metric": k, "value": float(v)}
            for k, v in metrics.items()
        ]
