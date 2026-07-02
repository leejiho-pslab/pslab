from cafe24_ops.clients.region_sheet import parse_region_csv, sheet_csv_url


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
