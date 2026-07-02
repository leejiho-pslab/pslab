import json

import httpx

from cafe24_ops.clients.ga4 import (
    GA4Client,
    ga4_report_to_channel_conversions,
    ga4_report_to_new_returning,
    ga4_report_to_visitors,
)


def test_ga4_report_to_visitors_mapping():
    assert ga4_report_to_visitors({"rows": [{"metricValues": [{"value": "1234"}]}]}) == 1234
    assert ga4_report_to_visitors({"rows": []}) is None      # 데이터 없음
    assert ga4_report_to_visitors({}) is None
    assert ga4_report_to_visitors({"rows": [{"metricValues": []}]}) is None


def test_ga4_report_to_new_returning_mapping():
    raw = {"rows": [
        {"dimensionValues": [{"value": "new"}], "metricValues": [{"value": "700"}]},
        {"dimensionValues": [{"value": "returning"}], "metricValues": [{"value": "300"}]},
    ]}
    assert ga4_report_to_new_returning(raw) == {"new": 700, "returning": 300}
    # 빈문자(미상) 세그먼트는 신규로 합산
    raw2 = {"rows": [{"dimensionValues": [{"value": ""}], "metricValues": [{"value": "50"}]}]}
    assert ga4_report_to_new_returning(raw2) == {"new": 50, "returning": 0}
    assert ga4_report_to_new_returning({"rows": []}) is None
    assert ga4_report_to_new_returning({}) is None


def test_ga4_report_to_channel_conversions_mapping():
    raw = {"rows": [
        {"dimensionValues": [{"value": "naver / cpc"}],
         "metricValues": [{"value": "12"}, {"value": "480000"}]},
        {"dimensionValues": [{"value": "facebook / cpc"}],
         "metricValues": [{"value": "5"}, {"value": "150000"}]},
        {"dimensionValues": [{"value": "unknown-source / referral"}],
         "metricValues": [{"value": "2"}, {"value": "0"}]},
    ]}
    out = ga4_report_to_channel_conversions(raw)
    assert out["naver_powerlink"] == {"conversions": 12.0, "ga4_conversion_value": 480000.0}
    assert out["meta"] == {"conversions": 5.0, "ga4_conversion_value": 150000.0}
    assert out["ga4_unmapped"] == {"conversions": 2.0, "ga4_conversion_value": 0.0}  # 매핑 안 되면 유실 없이 남음


def test_ga4_report_to_channel_conversions_custom_mapping():
    raw = {"rows": [{"dimensionValues": [{"value": "naver_place / cpc"}],
                      "metricValues": [{"value": "3"}, {"value": "9000"}]}]}
    out = ga4_report_to_channel_conversions(raw, mapping={"naver_place / cpc": "naver_place"})
    assert out["naver_place"]["conversions"] == 3.0


def test_daily_channel_conversions_http():
    def handler(req: httpx.Request) -> httpx.Response:
        assert "properties/1/:runReport" not in str(req.url)  # sanity: 실제 프로퍼티id 사용
        return httpx.Response(200, json={"rows": [
            {"dimensionValues": [{"value": "naver / cpc"}],
             "metricValues": [{"value": "4"}, {"value": "20000"}]},
        ]})

    c = GA4Client("999", {"type": "service_account"},
                  transport=httpx.MockTransport(handler), token_fn=lambda: "tok")
    try:
        out = c.daily_channel_conversions("2026-06-28")
        assert out["naver_powerlink"]["conversions"] == 4.0
    finally:
        c.close()


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
