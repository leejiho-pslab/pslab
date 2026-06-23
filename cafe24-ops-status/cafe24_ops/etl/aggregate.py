"""집계 — 정규화된 Fact 로부터 일자별 KPI(kpi_daily)를 계산한다.

Phase 0: 카페24 소스의 지표를 그대로 일자 KPI 로 적재한다.
(기간 비교/카테고리 집계 등 고도화는 Phase 1~ 에서 metrics.yaml 기반으로 확장)
"""
from __future__ import annotations

from ..config import MetricsConfig
from ..models import Fact


def aggregate_daily(date: str, facts: list[Fact], metrics: MetricsConfig) -> dict[str, float]:
    """해당 일자의 KPI 딕셔너리(metric -> value)를 만든다.

    카페24 소스의 dims 없는 지표만 일자 KPI 로 사용한다.
    """
    wanted = set(metrics.summary_keys) | set(metrics.period_keys)
    kpis: dict[str, float] = {}
    for f in facts:
        if f.source != "cafe24" or f.dims:
            continue
        if wanted and f.metric not in wanted:
            continue
        kpis[f.metric] = f.value
    return kpis
