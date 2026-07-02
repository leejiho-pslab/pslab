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
    ("AD-001", "샤틴 레이스 블라우스 후킹", "meta"),
    ("AD-002", "헌치 데님 팬츠 할인", "meta"),
    ("AD-003", "에스블랑 니트 신상", "google"),
    ("AD-004", "샤틴 하이넥 니트", "google"),
    ("AD-005", "헌치 자켓 가을 무드", "naver"),
    ("AD-006", "에스블랑 원피스 UGC", "kakao"),
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
        """Meta 소재(ad)별 성과 + 이미지. (구글/네이버/카카오 소재는 추후)"""
        import os

        from ..store import Store

        records: list[dict] = []
        collected = False
        kv = Store(self.config.data_dir)
        try:
            db_token = kv.get_kv("meta_access_token")
            if os.environ.get("META_ACCESS_TOKEN") or db_token:
                from ..clients.ads_meta import MetaAdsClient

                acc = next((a for a in self.config.sources.ads if a.get("channel") == "meta"), {})
                client = MetaAdsClient.from_account(acc)
                if db_token:
                    client.access_token = db_token  # DB 장기토큰 우선(ads 수집기가 갱신·저장)
                try:
                    records += client.fetch_creatives(date)
                    collected = True
                finally:
                    client.close()
        finally:
            kv.close()
        if not collected:
            raise NotImplementedError("[creative] Meta 자격증명이 없습니다(설정 시 소재별 수집).")
        return records
