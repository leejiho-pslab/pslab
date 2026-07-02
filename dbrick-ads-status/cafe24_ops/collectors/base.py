"""수집기 베이스 클래스.

각 소스 collector 는 collect(date) 에서 '원천 레코드(dict) 리스트'를 반환한다.
레코드 표준 형태: {"date","source","metric","value","dims"?}

- mode == "mock": 샘플 데이터를 생성 (Phase 0 기본값, API 연동 전 전체 흐름 검증용)
- mode == "live": 실제 API 호출 (각 collector 의 collect_live 에서 구현 — Phase 1~)
"""
from __future__ import annotations

from ..config import AppConfig


class BaseCollector:
    source = "base"

    def __init__(self, config: AppConfig, mode: str = "mock"):
        self.config = config
        self.mode = mode

    def collect(self, date: str) -> list[dict]:
        if self.mode == "live":
            return self.collect_live(date)
        return self.collect_mock(date)

    # 하위 클래스에서 구현
    def collect_mock(self, date: str) -> list[dict]:
        return []

    def collect_live(self, date: str) -> list[dict]:
        raise NotImplementedError(
            f"[{self.source}] live 수집은 Phase 1~ 에서 구현됩니다. 현재는 mock 모드를 사용하세요."
        )
