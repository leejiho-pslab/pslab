"""구글 시트 — 온라인 인입 지역 현황표 커넥터.

두 가지 연결 방식을 지원한다(우선순위 순):

1) (권장, 비공개) 서비스계정 방식 — GOOGLE_APPLICATION_CREDENTIALS_JSON 이 설정돼
   있으면 Google Sheets API 로 읽는다. 시트를 "링크가 있는 모든 사용자"로 공개할
   필요 없이, 서비스계정 이메일에만 뷰어 권한을 부여하면 된다(GA4 연동에 쓰는
   서비스계정을 그대로 재사용 가능 — Cloud 프로젝트에서 Google Sheets API 도 함께
   활성화해야 함).
2) (대체, 공개 필요) CSV export 방식 — 서비스계정 미설정 시 폴백. 시트가
   "링크가 있는 모든 사용자 → 뷰어"로 공개돼 있어야 동작한다.

수집 파이프라인(daily facts)과 무관하게 요청 시점에 매번 조회하되, 과도한 조회를
막기 위해 짧은 TTL 인메모리 캐시를 둔다.
"""
from __future__ import annotations

import csv
import io
import json
import os
import time

import httpx

_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL_SECONDS = 300  # 5분 — 수동 갱신 시트라 자주 조회할 필요 없음

SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"
SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"


def sheet_csv_url(sheet_id: str, gid: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def parse_region_csv(text: str) -> dict:
    """CSV 텍스트 → {"headers": [...], "rows": [[...], ...]}. 빈 값이면 headers/rows 빈 리스트."""
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not rows:
        return {"headers": [], "rows": []}
    return {"headers": rows[0], "rows": rows[1:]}


def pick_sheet_title(spreadsheet_meta: dict, gid: str) -> str | None:
    """spreadsheets.get 응답(sheets.properties(sheetId,title)) → gid 에 해당하는 탭 이름."""
    for s in (spreadsheet_meta or {}).get("sheets", []):
        props = s.get("properties", {})
        if str(props.get("sheetId")) == str(gid):
            return props.get("title")
    return None


def values_to_region(values: list[list[str]]) -> dict:
    """Sheets API values.get 응답의 "values" → {"headers": [...], "rows": [...]}."""
    if not values:
        return {"headers": [], "rows": []}
    return {"headers": values[0], "rows": values[1:]}


def _service_account_credentials() -> dict | None:
    """환경변수가 아예 없으면 None(→ 공개 CSV 로 폴백). 있는데 JSON 파싱이 안 되면
    예외를 던져서 명확한 에러로 알린다(등록값이 깨졌는데 조용히 공개 CSV 로 숨어버리는
    것을 막기 위함 — 그러면 "왜 서비스계정을 등록했는데도 공개 링크 에러가 나지?" 같은
    혼란스러운 상황이 생긴다)."""
    raw = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as e:
        raise ValueError(
            f"GOOGLE_APPLICATION_CREDENTIALS_JSON 값이 올바른 JSON이 아닙니다"
            f"(복사/붙여넣기 중 잘렸거나 깨졌을 수 있음): {e}"
        ) from e


def _sheets_access_token(credentials_info: dict) -> str:
    from google.oauth2 import service_account  # noqa: PLC0415
    import google.auth.transport.requests as gtr  # noqa: PLC0415

    creds = service_account.Credentials.from_service_account_info(
        credentials_info, scopes=[SHEETS_SCOPE])
    creds.refresh(gtr.Request())
    return creds.token


def _raise_with_body(resp: httpx.Response) -> None:
    """raise_for_status 는 응답 본문(구글 API 의 실제 에러 사유)을 안 보여줘서 진단이 어렵다
    — 본문을 메시지에 붙여서 재발생시킨다(예: 403 PERMISSION_DENIED 인지, API 미활성화인지 등)."""
    try:
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        body = resp.text[:300]
        raise httpx.HTTPStatusError(f"{e} — 응답: {body}", request=e.request, response=e.response) from e


def fetch_via_sheets_api(sheet_id: str, gid: str, credentials_info: dict, timeout: float = 15.0) -> dict:
    """서비스계정 인증으로 Sheets API 조회 — 시트를 공개할 필요 없음(서비스계정에만 뷰어 공유)."""
    token = _sheets_access_token(credentials_info)
    headers = {"Authorization": f"Bearer {token}"}

    meta = httpx.get(
        f"{SHEETS_API_BASE}/{sheet_id}",
        params={"fields": "sheets.properties(sheetId,title)"},
        headers=headers, timeout=timeout,
    )
    _raise_with_body(meta)
    title = pick_sheet_title(meta.json(), gid)
    if not title:
        raise ValueError(f"gid={gid} 에 해당하는 시트 탭을 찾을 수 없습니다")

    values_resp = httpx.get(
        f"{SHEETS_API_BASE}/{sheet_id}/values/{title}",
        headers=headers, timeout=timeout,
    )
    _raise_with_body(values_resp)
    return values_to_region(values_resp.json().get("values", []))


def fetch_via_csv_export(sheet_id: str, gid: str, timeout: float = 15.0) -> dict:
    """공개 CSV export 조회 — 시트가 "링크가 있는 모든 사용자 → 뷰어"여야 동작."""
    resp = httpx.get(sheet_csv_url(sheet_id, gid), timeout=timeout, follow_redirects=True)
    resp.raise_for_status()
    return parse_region_csv(resp.text)


def fetch_region_status(sheet_id: str, gid: str, timeout: float = 15.0) -> dict:
    """캐시 우선 조회 → 만료 시 재조회.

    GOOGLE_APPLICATION_CREDENTIALS_JSON(서비스계정)이 있으면 비공개 Sheets API 를
    우선 사용하고, 없으면 공개 CSV export 로 폴백한다. 실패해도 예외 없이 error
    필드로 알려주며, 직전 성공 캐시가 있으면 그거라도 보여준다.
    """
    cache_key = f"{sheet_id}:{gid}"
    cached = _CACHE.get(cache_key)
    now = time.time()
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    try:
        credentials_info = _service_account_credentials()
        if credentials_info:
            data = fetch_via_sheets_api(sheet_id, gid, credentials_info, timeout)
        else:
            data = fetch_via_csv_export(sheet_id, gid, timeout)
    except Exception as e:  # noqa: BLE001
        if cached:
            return cached[1]
        return {"headers": [], "rows": [], "error": f"시트 조회 실패: {e}"}

    result = {**data, "error": None, "fetched_at": int(now)}
    _CACHE[cache_key] = (now, result)
    return result
