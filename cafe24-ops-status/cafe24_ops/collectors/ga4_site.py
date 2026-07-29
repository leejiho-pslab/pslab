"""GA4 사이트 분석 수집기 — 세션·페이지뷰·체류시간 + 매체별/페이지별 상세.

카페24가 매출·주문의 원천이라면, GA4는 "어디서 들어와서 어떻게 움직였는지"의 원천이다.
광고 성과와 나란히 보도록 GA4 데이터를 여러 source 로 나눠 일자별 facts 로 적재한다:
  - source='ga4_site'    : 사이트 요약 스칼라(방문자/세션/페이지뷰/체류시간/신규/재방문)
  - source='ga4_channel' : sessionSourceMedium 별 세션/사용자/전환 (dims.source_medium)
  - source='ga4_page'    : pageTitle 별 조회수 상위 (dims.page)
  - source='ga4_landing' : landingPage 별 세션/이탈률/참여율 (dims.page) — 이탈 추적
  - source='ga4_entry'   : (landingPage × 매체) 세션 (dims.page, dims.source_medium) — 유입 경로
  - source='ga4_funnel'  : (퍼널 이벤트 × 매체) 건수 (dims.event, dims.source_medium) — 구매 경로

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
# 랜딩페이지는 경로(path) 형태 — GA4 landingPage 실제 값 형태와 동일하게
_MOCK_LANDING = ["/product/detail.html", "/main.html", "/product/list.html",
                 "/board/review", "/order/basket.html"]


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
        # 랜딩페이지별 세션/이탈률/참여율
        for lp in _MOCK_LANDING:
            bounce = round(r.uniform(35, 85), 2)
            for metric, val in (("sessions", float(r.randint(80, 900))),
                                ("bounce_rate", bounce),
                                ("engagement_rate", round(100 - bounce, 2))):
                records.append({"date": date, "source": "ga4_landing", "metric": metric,
                                "value": val, "dims": {"page": lp}})
        # 유입 경로(랜딩페이지 × 매체)
        for sm in _MOCK_SOURCE_MEDIUM[:5]:
            for lp in _MOCK_LANDING[:3]:
                records.append({"date": date, "source": "ga4_entry", "metric": "sessions",
                                "value": float(r.randint(10, 600)),
                                "dims": {"page": lp, "source_medium": sm}})
        # 구매 퍼널(이벤트 × 매체) — 단계가 내려갈수록 줄어들게
        from ..clients.ga4 import FUNNEL_STEPS

        for sm in _MOCK_SOURCE_MEDIUM[:5]:
            remain = float(r.randint(800, 4000))
            for event, _ in FUNNEL_STEPS:
                records.append({"date": date, "source": "ga4_funnel", "metric": "count",
                                "value": round(remain),
                                "dims": {"event": event, "source_medium": sm}})
                remain = max(0.0, remain * r.uniform(0.25, 0.75))
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

            # 랜딩페이지별 이탈률/참여율 — 어느 페이지에서 새는지
            for row in (client.daily_landing_pages(date) or []):
                for metric in ("sessions", "bounce_rate", "engagement_rate"):
                    records.append({"date": date, "source": "ga4_landing", "metric": metric,
                                    "value": float(row.get(metric, 0)), "dims": {"page": row["page"]}})

            # 유입 경로 — 어떤 광고가 어느 페이지로 보내는지
            for row in (client.daily_landing_by_channel(date) or []):
                records.append({"date": date, "source": "ga4_entry", "metric": "sessions",
                                "value": float(row.get("sessions", 0)),
                                "dims": {"page": row["page"], "source_medium": row["source_medium"]}})

            # 구매 퍼널 — 채널별 단계 이탈
            for row in (client.daily_funnel(date) or []):
                records.append({"date": date, "source": "ga4_funnel", "metric": "count",
                                "value": float(row.get("count", 0)),
                                "dims": {"event": row["event"], "source_medium": row["source_medium"]}})
        finally:
            client.close()
        return records
