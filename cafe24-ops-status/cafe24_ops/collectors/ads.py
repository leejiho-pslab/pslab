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

    def _meta_db_token(self) -> str | None:
        """DB(app_kv)에 영속된 Meta 장기 토큰. env 토큰이 비어도 DB 토큰으로 수집 가능."""
        from ..store import Store

        kv = Store(self.config.data_dir)
        try:
            return kv.get_kv("meta_access_token")
        except Exception:
            return None
        finally:
            kv.close()

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
            if channel == "meta" and (os.environ.get("META_ACCESS_TOKEN") or self._meta_db_token()):
                from ..clients.ads_meta import MetaAdsClient
                from ..store import Store

                client = MetaAdsClient.from_account(acc)
                kv = Store(self.config.data_dir)
                try:
                    # DB 에 영속된 장기 토큰을 최우선 사용(무인 토큰 갱신 대응). 없으면 env.
                    db_token = kv.get_kv("meta_access_token")
                    if db_token:
                        client.access_token = db_token
                    # 매 실행마다 60일 토큰으로 연장 → DB 저장(app_id/secret 있을 때만).
                    app_id = os.environ.get("META_APP_ID")
                    app_secret = os.environ.get("META_APP_SECRET")
                    if app_id and app_secret:
                        new_token = client.exchange_for_long_lived(app_id, app_secret)
                        if new_token:
                            client.access_token = new_token
                            kv.set_kv("meta_access_token", new_token)
                    records += client.fetch_facts(date)
                finally:
                    client.close()
                    kv.close()
                collected_any = True
            elif channel == "google" and os.environ.get("GOOGLE_ADS_ACCESS_TOKEN"):
                from ..clients.ads_google import GoogleAdsClient

                client = GoogleAdsClient.from_account(acc)
                try:
                    records += client.fetch_facts(date)
                finally:
                    client.close()
                collected_any = True
            elif channel == "naver" and os.environ.get("NAVER_SA_API_KEY"):
                from ..clients.ads_naver import NaverSearchAdClient

                client = NaverSearchAdClient.from_account(acc)
                try:
                    records += client.fetch_facts(date)
                finally:
                    client.close()
                collected_any = True
            elif channel == "kakao" and os.environ.get("KAKAO_ACCESS_TOKEN"):
                from ..clients.ads_kakao import KakaoMomentClient

                client = KakaoMomentClient.from_account(acc)
                try:
                    records += client.fetch_facts(date)
                finally:
                    client.close()
                collected_any = True
        if not collected_any:
            raise NotImplementedError(
                "[ads] 광고 플랫폼 자격증명이 없습니다. META/GOOGLE/NAVER/KAKAO 설정 시 활성화됩니다."
            )
        return records
