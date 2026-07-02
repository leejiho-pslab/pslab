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
                    # 60일 토큰으로 연장 → DB 저장. 백필(다일) 시 매일 교환은 낭비라
                    # 실행(프로세스)당 1회만 교환한다(이후 날짜는 DB 토큰 재사용).
                    app_id = os.environ.get("META_APP_ID")
                    app_secret = os.environ.get("META_APP_SECRET")
                    if app_id and app_secret and not getattr(self, "_meta_refreshed", False):
                        new_token = client.exchange_for_long_lived(app_id, app_secret)
                        if new_token:
                            client.access_token = new_token
                            kv.set_kv("meta_access_token", new_token)
                        self._meta_refreshed = True
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
        return self._apply_ga4_conversions(date, records)

    def _apply_ga4_conversions(self, date: str, records: list[dict]) -> list[dict]:
        """GA4 전환 데이터가 연동돼 있으면(GA4_PROPERTY_ID + 서비스계정 키), 각 광고
        플랫폼이 자체 보고한 conversions 를 GA4 기준 값으로 대체한다. 매핑 안 되는
        source/medium 은 channel="ga4_unmapped" 로 남겨 유실 없이 확인 가능하게 한다.
        GA4 미연동(env 없음)이면 아무 변경 없이 원본 그대로 반환한다.
        """
        from ..clients.ga4 import GA4Client

        client = GA4Client.from_env()
        if client is None:
            return records
        try:
            mapping = self._ga4_channel_mapping()
            by_channel = client.daily_channel_conversions(date, mapping)
        finally:
            client.close()
        if not by_channel:
            return records

        kept = [r for r in records if r.get("metric") != "conversions"]
        for channel, agg in by_channel.items():
            kept.append({
                "date": date, "source": self.source, "metric": "conversions",
                "value": agg.get("conversions", 0.0), "dims": {"channel": channel},
            })
            if agg.get("ga4_conversion_value"):
                kept.append({
                    "date": date, "source": self.source, "metric": "ga4_conversion_value",
                    "value": agg["ga4_conversion_value"], "dims": {"channel": channel},
                })
        return kept

    def _ga4_channel_mapping(self) -> dict | None:
        """config/ga4_channel_map.yaml 이 있으면 GA4 기본 매핑 위에 덮어써서 사용한다.
        (디브릭 실제 UTM 태깅 규칙에 맞춰 조정할 때 코드 수정 없이 이 파일만 바꾸면 됨)
        """
        from ..clients.ga4 import DEFAULT_SOURCE_MEDIUM_CHANNEL
        from ..config import CONFIG_DIR
        import yaml

        path = CONFIG_DIR / "ga4_channel_map.yaml"
        if not path.exists():
            return DEFAULT_SOURCE_MEDIUM_CHANNEL
        with path.open(encoding="utf-8") as f:
            override = yaml.safe_load(f) or {}
        return {**DEFAULT_SOURCE_MEDIUM_CHANNEL, **override}
