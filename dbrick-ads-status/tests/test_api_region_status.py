from fastapi.testclient import TestClient

import api.main as api_main
from api.main import app


def test_region_status_endpoint_returns_sheet_data(monkeypatch):
    monkeypatch.setattr(
        api_main, "fetch_region_status",
        lambda sheet_id, gid: {"headers": ["지역", "유입수"], "rows": [["서울", "10"]], "error": None},
    )
    c = TestClient(app)
    r = c.get("/api/region-status")
    assert r.status_code == 200
    body = r.json()
    assert body["headers"] == ["지역", "유입수"]
    assert body["rows"] == [["서울", "10"]]
    assert body["error"] is None
