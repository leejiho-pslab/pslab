from fastapi.testclient import TestClient

from api.main import app


def test_health_reports_freshness():
    c = TestClient(app)
    r = c.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("ok", "degraded")
    assert "db" in body and "latest_date" in body and "facts" in body
