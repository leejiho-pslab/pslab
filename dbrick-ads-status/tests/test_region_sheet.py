import cafe24_ops.clients.region_sheet as region_sheet
from cafe24_ops.clients.region_sheet import (
    fetch_region_status,
    parse_region_csv,
    pick_sheet_title,
    sheet_csv_url,
    values_to_region,
)


def test_sheet_csv_url_builds_export_link():
    url = sheet_csv_url("SHEET123", "999")
    assert url == "https://docs.google.com/spreadsheets/d/SHEET123/export?format=csv&gid=999"


def test_parse_region_csv_splits_header_and_rows():
    csv_text = "지역,유입수,비중\n서울,120,40%\n경기,90,30%\n"
    out = parse_region_csv(csv_text)
    assert out["headers"] == ["지역", "유입수", "비중"]
    assert out["rows"] == [["서울", "120", "40%"], ["경기", "90", "30%"]]


def test_parse_region_csv_empty_input():
    assert parse_region_csv("") == {"headers": [], "rows": []}
    assert parse_region_csv("\n\n") == {"headers": [], "rows": []}


def test_pick_sheet_title_matches_gid():
    meta = {"sheets": [
        {"properties": {"sheetId": 0, "title": "Sheet1"}},
        {"properties": {"sheetId": 1478961985, "title": "지역현황"}},
    ]}
    assert pick_sheet_title(meta, "1478961985") == "지역현황"
    assert pick_sheet_title(meta, "9999") is None
    assert pick_sheet_title({}, "0") is None


def test_values_to_region_splits_header_and_rows():
    values = [["지역", "유입수"], ["서울", "120"], ["경기", "90"]]
    assert values_to_region(values) == {
        "headers": ["지역", "유입수"], "rows": [["서울", "120"], ["경기", "90"]],
    }
    assert values_to_region([]) == {"headers": [], "rows": []}


def test_fetch_region_status_prefers_sheets_api_when_credentials_present(monkeypatch):
    # 서비스계정(GOOGLE_APPLICATION_CREDENTIALS_JSON)이 있으면 공개 CSV 가 아니라
    # 비공개 Sheets API 경로를 타야 한다.
    monkeypatch.setattr(region_sheet, "_service_account_credentials", lambda: {"type": "service_account"})
    calls = {"sheets_api": 0, "csv": 0}

    def fake_sheets_api(sheet_id, gid, credentials_info, timeout=15.0):
        calls["sheets_api"] += 1
        return {"headers": ["지역"], "rows": [["서울"]]}

    def fake_csv(sheet_id, gid, timeout=15.0):
        calls["csv"] += 1
        return {"headers": [], "rows": []}

    monkeypatch.setattr(region_sheet, "fetch_via_sheets_api", fake_sheets_api)
    monkeypatch.setattr(region_sheet, "fetch_via_csv_export", fake_csv)
    region_sheet._CACHE.clear()

    out = fetch_region_status("SHEET1", "1")
    assert calls == {"sheets_api": 1, "csv": 0}
    assert out["headers"] == ["지역"] and out["error"] is None


def test_fetch_region_status_falls_back_to_csv_without_credentials(monkeypatch):
    monkeypatch.setattr(region_sheet, "_service_account_credentials", lambda: None)
    calls = {"sheets_api": 0, "csv": 0}

    monkeypatch.setattr(region_sheet, "fetch_via_sheets_api",
                        lambda *a, **k: calls.__setitem__("sheets_api", calls["sheets_api"] + 1))
    monkeypatch.setattr(region_sheet, "fetch_via_csv_export",
                        lambda *a, **k: (calls.__setitem__("csv", calls["csv"] + 1),
                                          {"headers": ["A"], "rows": []})[1])
    region_sheet._CACHE.clear()

    out = fetch_region_status("SHEET2", "2")
    assert calls == {"sheets_api": 0, "csv": 1}
    assert out["headers"] == ["A"]


def test_fetch_region_status_reports_broken_credentials_instead_of_silent_fallback(monkeypatch):
    # 환경변수는 있는데 JSON 파싱이 안 되면(복사/붙여넣기 깨짐 등), 공개 CSV 로 조용히
    # 폴백하지 말고 원인을 명확히 알려야 한다(그래야 "서비스계정 등록했는데 왜 공개 링크
    # 에러가 나지?" 같은 혼란이 안 생긴다).
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "{이건 유효한 JSON이 아님")
    calls = {"csv": 0}
    monkeypatch.setattr(region_sheet, "fetch_via_csv_export",
                        lambda *a, **k: calls.__setitem__("csv", calls["csv"] + 1))
    region_sheet._CACHE.clear()

    out = fetch_region_status("SHEET3", "3")
    assert calls["csv"] == 0                 # CSV 로 폴백하지 않아야 함
    assert "JSON" in out["error"]
