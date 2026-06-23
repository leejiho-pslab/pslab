"""정규화 — 소스별 원천 레코드를 표준 Fact 로 통일하고 중복을 제거한다."""
from __future__ import annotations

from ..models import Fact


def normalize(raw_records: list[dict]) -> list[Fact]:
    """원천 dict 레코드 리스트 → 표준 Fact 리스트.

    - 값 타입을 float 로 강제
    - (date, source, metric, dims) 기준 중복 제거 (뒤에 온 값이 우선)
    """
    deduped: dict[tuple, Fact] = {}
    for rec in raw_records:
        if "date" not in rec or "metric" not in rec:
            continue  # 필수 필드 없는 레코드는 건너뜀
        fact = Fact.from_raw(rec)
        deduped[fact.key()] = fact
    return list(deduped.values())
