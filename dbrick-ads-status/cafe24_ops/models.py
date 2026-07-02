"""파이프라인 전반에서 쓰는 표준 데이터 모델."""
from __future__ import annotations

import json
from dataclasses import dataclass, field


@dataclass
class Fact:
    """정규화된 단일 측정값.

    수집 소스가 무엇이든 최종적으로 이 형태(날짜 × 소스 × 지표 × 값)로 통일된다.
    """
    date: str          # YYYY-MM-DD
    source: str        # cafe24 | ads | creative | competitor
    metric: str        # 지표 키 (예: gross_sales)
    value: float
    dims: dict = field(default_factory=dict)  # 부가 차원 (예: {"channel": "meta"})

    @property
    def dims_json(self) -> str:
        return json.dumps(self.dims, ensure_ascii=False, sort_keys=True)

    @classmethod
    def from_raw(cls, rec: dict) -> "Fact":
        return cls(
            date=str(rec["date"]),
            source=str(rec.get("source", "unknown")),
            metric=str(rec["metric"]),
            value=float(rec.get("value", 0) or 0),
            dims=dict(rec.get("dims", {}) or {}),
        )

    def key(self) -> tuple:
        return (self.date, self.source, self.metric, self.dims_json)
