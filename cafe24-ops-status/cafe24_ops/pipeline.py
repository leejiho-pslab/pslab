"""파이프라인 오케스트레이션 — 수집 → 정규화 → 집계 → 저장.

매일 1회(데일리) 전일자 데이터를 처리하는 무인 파이프라인의 핵심.
run_all.py 와 테스트가 이 함수를 호출한다.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date as _date
from datetime import timedelta

from .collectors import build_collectors
from .config import AppConfig
from .etl.aggregate import aggregate_daily
from .etl.normalize import normalize
from .store import Store

log = logging.getLogger("cafe24_ops.pipeline")


def yesterday() -> str:
    return (_date.today() - timedelta(days=1)).isoformat()


@dataclass
class PipelineResult:
    date: str
    mode: str
    raw_count: int = 0
    fact_count: int = 0
    kpi: dict = field(default_factory=dict)
    per_source: dict = field(default_factory=dict)
    errors: dict = field(default_factory=dict)


def run_pipeline(
    date: str,
    config: AppConfig,
    store: Store,
    mode: str | None = None,
    collectors: list | None = None,
) -> PipelineResult:
    mode = (mode or config.mode).lower()
    result = PipelineResult(date=date, mode=mode)
    cols = collectors if collectors is not None else build_collectors(config, mode)

    # 1) 수집 ---------------------------------------------------------
    log.info("① 수집 시작 (date=%s, mode=%s)", date, mode)
    all_raw: list[dict] = []
    for collector in cols:
        try:
            records = collector.collect(date)
        except NotImplementedError as e:
            # 아직 실연동 안 된 소스(광고/소재/경쟁사)는 건너뛴다 — 점진적 롤아웃
            log.warning("   - %-11s 건너뜀 (%s)", collector.source, e)
            result.per_source[collector.source] = 0
            continue
        except Exception as e:  # noqa: BLE001 - 한 소스 실패가 전체 수집을 막지 않게(live 견고화)
            log.error("   - %-11s 실패: %s: %s", collector.source, type(e).__name__, e)
            result.errors[collector.source] = f"{type(e).__name__}: {e}"
            result.per_source[collector.source] = 0
            continue
        store.save_raw(date, collector.source, records)
        result.per_source[collector.source] = len(records)
        all_raw.extend(records)
        log.info("   - %-11s %d건", collector.source, len(records))
    result.raw_count = len(all_raw)

    # 2) 정규화 -------------------------------------------------------
    log.info("② 정규화")
    facts = normalize(all_raw)
    result.fact_count = len(facts)

    # 3) 집계 + 저장 --------------------------------------------------
    log.info("③ 집계 + 저장")
    # 이번에 수집된 소스만 해당 일자 facts 를 비우고 다시 넣는다(차원 변경된 낡은 행 제거).
    # 수집 실패/스킵 소스(facts 없음)는 건드리지 않아 기존 데이터를 보존한다.
    for src in {f.source for f in facts}:
        store.delete_facts(date, src)
    store.upsert_facts(facts)
    kpi = aggregate_daily(date, facts, config.metrics)
    store.upsert_kpi(date, kpi)
    result.kpi = kpi

    # 수집 상태를 DB에 남겨 자가모니터링(수집 실패 알림)에 사용한다.
    import json as _json
    try:
        store.set_kv(f"collect_status:{date}", _json.dumps(
            {"per_source": result.per_source, "errors": result.errors}, ensure_ascii=False))
    except Exception:  # noqa: BLE001 - 상태 기록 실패가 파이프라인을 막지 않게
        pass

    log.info("완료: raw=%d, facts=%d, kpi=%d", result.raw_count, result.fact_count, len(kpi))
    return result
