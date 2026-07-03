"""수집기 모듈 — 소스별 collector 를 구성한다."""
from __future__ import annotations

from ..config import AppConfig
from .ads import AdsCollector
from .base import BaseCollector
from .cafe24 import Cafe24Collector
from .competitor import CompetitorCollector
from .creative import CreativeCollector
from .ga4_site import Ga4SiteCollector


def build_collectors(config: AppConfig, mode: str) -> list[BaseCollector]:
    """활성화된 모든 수집기를 생성한다."""
    return [
        Cafe24Collector(config, mode),
        AdsCollector(config, mode),
        CreativeCollector(config, mode),
        CompetitorCollector(config, mode),
        Ga4SiteCollector(config, mode),
    ]


__all__ = [
    "BaseCollector",
    "Cafe24Collector",
    "AdsCollector",
    "CreativeCollector",
    "CompetitorCollector",
    "Ga4SiteCollector",
    "build_collectors",
]
