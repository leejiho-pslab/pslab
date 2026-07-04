"""GA4 사이트 분석 수집기 — 방문자·세션·페이지뷰·체류시간 + 매체별/페이지별 상세.

디브릭은 자사몰(카페24)이 없어 방문 지표의 원천이 GA4 뿐이다. 광고 성과와 나란히
보도록 GA4 데이터를 여러 source 로 나눠 일자별 facts 로 적재한다:
  - source='ga4_site'    : 사이트 요약 스칼라(방문자/세션/페이지뷰/체류시간/신규/재방문)
  - source='ga4_channel' : sessionSourceMedium 별 세션/사용자/전환 (dims.source_medium)
  - source='ga4_page'    : pageTitle 별 조회수 상위 (dims.page)

활성화: GA4_PROPERTY_ID + GOOGLE_APPLICATION_CREDENTIALS_JSON (광고 전환 대체와 동일 자격증명).
없으면 NotImplementedError 로 스킵(파이프라인의 점진적 롤아웃 패턴).
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

# mock 매체/페이지 샘플 — 실제 GA4 값 형태를 흉내내 대시보드 흐름 검증용
_MOCK_SOURCE_MEDIUM = ["meta / cpc", "naver_sa / cpc", "(direct) / (none)",
                       "naver / organic", "ig / social", "google / organic"]
_MOCK_PAGES = ["무료 상담 | 디브릭", "디브릭 - 포트폴리오", "30평대 인테리어 | 디브릭",
               "디브릭 | 프리미엄 1:1 맞춤", "인테리어 서비스 소개", "공간별 인테리어 | 디브릭"]


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
        new = round(visitors * r.uniform(0.55, 0.8))
        records = [
            {"date": date, "source": "ga4_site", "metric": k, "value": v}
            for k, v in (
                ("site_visitors", visitors),
                ("site_sessions", float(sessions)),
                ("site_page_views", float(page_views)),
                ("site_avg_duration", avg_duration),
                ("site_new", float(new)),
                ("site_returning", float(visitors - new)),
            )
        ]
        # 매체별 세션/사용자/전환
        remaining = sessions
        for i, sm in enumerate(_MOCK_SOURCE_MEDIUM):
            share = r.uniform(0.05, 0.45) if i < len(_MOCK_SOURCE_MEDIUM) - 1 else 1.0
            s = max(1, round(remaining * share))
            remaining = max(0, remaining - s)
            for metric, val in (("sessions", float(s)),
                                ("users", float(round(s * r.uniform(0.8, 1.0)))),
                                ("conversions", float(r.randint(0, 12)))):
                records.append({"date": date, "source": "ga4_channel", "metric": metric,
                                "value": val, "dims": {"source_medium": sm}})
        # 페이지별 조회수
        for pg in _MOCK_PAGES:
            records.append({"date": date, "source": "ga4_page", "metric": "views",
                            "value": float(r.randint(50, 1300)), "dims": {"page": pg}})
        return records

    def collect_live(self, date: str) -> list[dict]:
        from ..clients.ga4 import GA4Client

        client = GA4Client.from_env()
        if client is None:
            raise NotImplementedError(
                "[ga4_site] GA4 자격증명이 없습니다. GA4_PROPERTY_ID + "
                "GOOGLE_APPLICATION_CREDENTIALS_JSON 설정 시 활성화됩니다."
            )
        records: list[dict] = []
        try:
            metrics = client.daily_site_metrics(date) or {}
            nr = client.daily_new_returning_metrics(date) or {}
            for k, v in {**metrics, **nr}.items():
                records.append({"date": date, "source": "ga4_site", "metric": k, "value": float(v)})

            for row in (client.daily_source_medium(date) or []):
                sm = row["source_medium"]
                for metric in ("sessions", "users", "conversions"):
                    records.append({"date": date, "source": "ga4_channel", "metric": metric,
                                    "value": float(row.get(metric, 0)), "dims": {"source_medium": sm}})

            for row in (client.daily_top_pages(date) or []):
                records.append({"date": date, "source": "ga4_page", "metric": "views",
                                "value": float(row.get("views", 0)), "dims": {"page": row["page"]}})
        finally:
            client.close()
        return records
