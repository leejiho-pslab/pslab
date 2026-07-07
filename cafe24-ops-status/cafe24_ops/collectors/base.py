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
        # 소스 내부의 부분 실패(예: ads 소스에서 meta 채널만 오류) 기록용.
        # 수집 자체는 성공(다른 채널 데이터 반환)해도 여기 남은 오류는 파이프라인이
        # result.errors 로 승격시켜 일일 브리핑 경고에 잡히게 한다.
        self.partial_errors: dict[str, str] = {}

    def collect(self, date: str) -> list[dict]:
        self.partial_errors = {}
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
