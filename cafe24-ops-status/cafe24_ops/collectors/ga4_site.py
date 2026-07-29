"""GA4 사이트 분석 수집기 — 세션·페이지뷰·체류시간 + 매체별/페이지별 상세.

카페24가 매출·주문의 원천이라면, GA4는 "어디서 들어와서 어떻게 움직였는지"의 원천이다.
광고 성과와 나란히 보도록 GA4 데이터를 여러 source 로 나눠 일자별 facts 로 적재한다:
  - source='ga4_site'    : 사이트 요약 스칼라(방문자/세션/페이지뷰/체류시간/신규/재방문)
  - source='ga4_channel' : sessionSourceMedium 별 세션/사용자/전환 (dims.source_medium)
  - source='ga4_page'    : pageTitle 별 조회수 상위 (dims.page)

전환은 GA4 keyEvents 지표가 아니라 결제완료 이벤트만 센다(clients/ga4.py CONVERSION_EVENT).
활성화: GA4_PROPERTY_ID + GOOGLE_APPLICATION_CREDENTIALS_JSON.
없으면 NotImplementedError 로 스킵(파이프라인의 점진적 롤아웃 패턴).
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

# mock 매체/페이지 샘플 — keek GA4 의 실제 source/medium 값 형태를 그대로 사용해
# 대시보드 흐름(매핑·라벨)을 mock 에서도 실제와 같게 검증한다.
_MOCK_SOURCE_MEDIUM = [
    "criteo / display", "sns / meta", "naver / gfa", "(direct) / (none)",
    "KK_BS_MO / bs", "ig / paid", "ig / social", "google / organic",
    "KK_powerlink_MO / powerlink", "google / cpc",
]
_MOCK_PAGES = [
    "keek Pillowdy UV Light Windbreaker V3", "keek | 공식 온라인 스토어",
    "OUTER | keek", "keek Pillowdy Logo Hoodie V3", "장바구니 | keek", "BEST | keek",
]


def _rng(date: str, salt: str) -> random.Random:
    seed = int(hashlib.sha256(f"{date}:{salt}".encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class Ga4SiteCollector(BaseCollector):
    source = "ga4_site"

    def collect_mock(self, date: str) -> list[dict]:
        r = _rng(date, "ga4_site")
        visitors = float(r.randint(900, 1900))
        sessions = round(visitors * r.uniform(1.1, 1.5))
        page_views = round(sessions * r.uniform(2.0, 4.5))
        avg_duration = round(r.uniform(20, 120), 1)  # 초
        new = round(visitors * r.uniform(0.55, 0.85))
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
                                ("conversions", float(r.randint(0, 3)))):
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
