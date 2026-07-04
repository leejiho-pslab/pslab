"""설정 로더 — config/metrics.yaml + config/sources.yaml 을 읽어 구조화한다.

핵심 설계: 대시보드의 모든 지표(카드/표/차트)는 metrics.yaml 로 정의된다.
이 파일만 바꾸면 코드 수정 없이 지표를 추가/삭제/순서변경할 수 있다.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
DATA_DIR = PROJECT_ROOT / "store"  # raw 스냅샷 + sqlite db 저장 위치 (gitignore)


def _load_yaml(path: Path) -> dict:
    if not path.exists():
        raise FileNotFoundError(f"설정 파일을 찾을 수 없습니다: {path}")
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


@dataclass
class CollectionConfig:
    granularity: str = "daily"
    timezone: str = "Asia/Seoul"
    run_at: str = "07:00"
    compare_windows: list[str] = field(default_factory=list)


@dataclass
class MetricsConfig:
    collection: CollectionConfig
    summary_cards: list[dict]
    period_comparison_rows: list[dict]
    daily_groups: list[dict]
    charts: list[dict]
    raw: dict

    @property
    def summary_keys(self) -> list[str]:
        return [c["key"] for c in self.summary_cards]

    @property
    def period_keys(self) -> list[str]:
        return [r["key"] for r in self.period_comparison_rows]

    def label_for(self, key: str) -> str:
        for c in self.summary_cards + self.period_comparison_rows:
            if c.get("key") == key:
                return c.get("label", key)
        return key


@dataclass
class SourcesConfig:
    shop: dict
    ads: list[dict]
    competitors: list[dict]
    raw: dict

    @property
    def region_status(self) -> dict:
        """대시보드 하단 '온라인 인입 지역 현황' 구글 시트 설정({sheet_id, gid}). 없으면 빈 dict."""
        return dict(self.raw.get("region_status", {}) or {})

    @property
    def competitor_media(self) -> dict:
        """경쟁사 인스타/광고 소재 구글 시트 설정({sheet_id, gid}). 없으면 빈 dict."""
        return dict(self.raw.get("competitor_media", {}) or {})


@dataclass
class AppConfig:
    metrics: MetricsConfig
    sources: SourcesConfig
    project_root: Path = PROJECT_ROOT
    data_dir: Path = DATA_DIR

    @property
    def mode(self) -> str:
        """mock(샘플 데이터) | live(실제 API). 기본값은 mock(Phase 0)."""
        return os.environ.get("CAFE24_OPS_MODE", "mock").strip().lower()


def load_metrics(path: Path | None = None) -> MetricsConfig:
    data = _load_yaml(path or CONFIG_DIR / "metrics.yaml")
    coll = data.get("collection", {}) or {}
    return MetricsConfig(
        collection=CollectionConfig(
            granularity=coll.get("granularity", "daily"),
            timezone=coll.get("timezone", "Asia/Seoul"),
            run_at=coll.get("run_at", "07:00"),
            compare_windows=list(coll.get("compare_windows", []) or []),
        ),
        summary_cards=list(data.get("summary_cards", []) or []),
        period_comparison_rows=list((data.get("period_comparison", {}) or {}).get("rows", []) or []),
        daily_groups=list((data.get("daily_table", {}) or {}).get("groups", []) or []),
        charts=list(data.get("charts", []) or []),
        raw=data,
    )


def load_sources(path: Path | None = None) -> SourcesConfig:
    data = _load_yaml(path or CONFIG_DIR / "sources.yaml")
    return SourcesConfig(
        shop=dict(data.get("shop", {}) or {}),
        ads=list(data.get("ads", []) or []),
        competitors=list(data.get("competitors", []) or []),
        raw=data,
    )


def load_config(config_dir: Path | None = None) -> AppConfig:
    cdir = config_dir or CONFIG_DIR
    return AppConfig(
        metrics=load_metrics(cdir / "metrics.yaml"),
        sources=load_sources(cdir / "sources.yaml"),
    )
