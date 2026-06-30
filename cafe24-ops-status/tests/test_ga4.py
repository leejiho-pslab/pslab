import json

import httpx

from cafe24_ops.clients.ga4 import GA4Client, ga4_report_to_visitors


def test_ga4_report_to_visitors_mapping():
    assert ga4_report_to_visitors({"rows": [{"metricValues": [{"value": "1234"}]}]}) == 1234
    assert ga4_report_to_visitors({"rows": []}) is None      # 데이터 없음
    assert ga4_report_to_visitors({}) is None
    assert ga4_report_to_visitors({"rows": [{"metricValues": []}]}) is None


def test_from_env_gating(monkeypatch):
    monkeypatch.delenv("GA4_PROPERTY_ID", raising=False)
    monkeypatch.delenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", raising=False)
    assert GA4Client.from_env() is None                       # 자격증명 없으면 비활성
    monkeypatch.setenv("GA4_PROPERTY_ID", "123")
    monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", json.dumps({"type": "service_account"}))
    c = GA4Client.from_env()
    assert c is not None and c.property_id == "123"


def test_daily_visitors_http(monkeypatch):
    # 토큰 발급은 token_fn 주입으로 우회, HTTP 는 mock transport 로 검증
    calls = {}

    def handler(req: httpx.Request) -> httpx.Response:
        calls["auth"] = req.headers.get("Authorization")
        calls["url"] = str(req.url)
        return httpx.Response(200, json={"rows": [{"metricValues": [{"value": "987"}]}]})

    c = GA4Client("999", {"type": "service_account"},
                  transport=httpx.MockTransport(handler), token_fn=lambda: "tok-abc")
    try:
        assert c.daily_visitors("2026-06-28") == 987
        assert calls["auth"] == "Bearer tok-abc"
        assert "properties/999:runReport" in calls["url"]
    finally:
        c.close()
