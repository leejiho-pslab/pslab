"""수집기 모듈 — 소스별 collector 를 구성한다."""
from __future__ import annotations

from ..config import AppConfig
from .ads import AdsCollector
from .base import BaseCollector
from .cafe24 import Cafe24Collector
from .cafe24_analytics import Cafe24AnalyticsCollector
from .competitor import CompetitorCollector
from .creative import CreativeCollector
from .ga4_site import Ga4SiteCollector
from .naver_keyword import NaverKeywordCollector


def build_collectors(config: AppConfig, mode: str) -> list[BaseCollector]:
    """활성화된 모든 수집기를 생성한다."""
    return [
        Cafe24Collector(config, mode),
        Cafe24AnalyticsCollector(config, mode),
        AdsCollector(config, mode),
        CreativeCollector(config, mode),
        NaverKeywordCollector(config, mode),
        Ga4SiteCollector(config, mode),
        CompetitorCollector(config, mode),
    ]


__all__ = [
    "BaseCollector",
    "Cafe24Collector",
    "Cafe24AnalyticsCollector",
    "AdsCollector",
    "CreativeCollector",
    "NaverKeywordCollector",
    "Ga4SiteCollector",
    "CompetitorCollector",
    "build_collectors",
]
