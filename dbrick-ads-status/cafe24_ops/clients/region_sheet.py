"""구글 시트 — 온라인 인입 지역 현황표 커넥터.

대표님이 직접 관리하는 구글 시트(수동 갱신)를 CSV export 링크로 읽어와 그대로
대시보드 하단에 표로 보여준다. 별도 API 키/서비스계정 없이 동작하려면 시트 공유
설정이 "링크가 있는 모든 사용자 → 뷰어"로 되어 있어야 한다(비공개 시트면 403).

수집 파이프라인(daily facts)과 무관하게 요청 시점에 매번 조회하되, 과도한 조회를
막기 위해 짧은 TTL 인메모리 캐시를 둔다.
"""
from __future__ import annotations

import csv
import io
import time

import httpx

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_SECONDS = 300  # 5분 — 수동 갱신 시트라 자주 조회할 필요 없음


def sheet_csv_url(sheet_id: str, gid: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def parse_region_csv(text: str) -> dict:
    """CSV 텍스트 → {"headers": [...], "rows": [[...], ...]}. 빈 값이면 headers/rows 빈 리스트."""
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return {"headers": [], "rows": []}
    return {"headers": rows[0], "rows": rows[1:]}


def fetch_region_status(sheet_id: str, gid: str, timeout: float = 15.0) -> dict:
    """캐시 우선 조회 → 만료 시 구글 시트 CSV 재조회. 실패해도 예외 없이 error 필드로 알려준다."""
    cache_key = f"{sheet_id}:{gid}"
    cached = _CACHE.get(cache_key)
    now = time.time()
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    url = sheet_csv_url(sheet_id, gid)
    try:
        resp = httpx.get(url, timeout=timeout, follow_redirects=True)
        resp.raise_for_status()
    except Exception as e:  # noqa: BLE001
        # 이전에 성공한 캐시가 있으면 그거라도 보여주고, 없으면 에러만 반환.
        if cached:
            return cached[1]
        return {"headers": [], "rows": [], "error": f"시트 조회 실패: {e}"}

    result = {**parse_region_csv(resp.text), "error": None, "fetched_at": int(now)}
    _CACHE[cache_key] = (now, result)
    return result
