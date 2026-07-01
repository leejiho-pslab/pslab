"""집계 — 정규화된 Fact 로부터 일자별 KPI(kpi_daily)를 계산한다.

Phase 0: 카페24 소스의 지표를 그대로 일자 KPI 로 적재한다.
(기간 비교/카테고리 집계 등 고도화는 Phase 1~ 에서 metrics.yaml 기반으로 확장)
"""
from __future__ import annotations

from ..config import MetricsConfig
from ..models import Fact


def aggregate_daily(date: str, facts: list[Fact], metrics: MetricsConfig) -> dict[str, float]:
    """해당 일자의 KPI 딕셔너리(metric -> value)를 만든다.

    카페24 소스의 dims 없는 지표는 그대로, 광고(ads) 소스는 채널(dims) 합산해서 사용한다.
    (ads facts 는 채널별로 나뉘어 있어 dims 없는 facts 만 보면 항상 비게 됨 — 채널 합산 필요)
    """
    wanted = set(metrics.summary_keys) | set(metrics.period_keys)
    kpis: dict[str, float] = {}
    ads_sums: dict[str, float] = {}
    for f in facts:
        if f.source == "cafe24" and not f.dims:
            if not wanted or f.metric in wanted:
                kpis[f.metric] = f.value
        elif f.source == "ads":
            ads_sums[f.metric] = ads_sums.get(f.metric, 0.0) + f.value
    for k, v in ads_sums.items():
        if not wanted or k in wanted:
            kpis[k] = v

    gross = kpis.get("gross_sales")
    if gross and "ad_cost" in kpis and "ad_cost_ratio" in wanted:
        kpis["ad_cost_ratio"] = round(kpis["ad_cost"] / gross * 100, 2)
    return kpis
