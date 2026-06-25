import httpx

from cafe24_ops.clients.ads_google import GoogleAdsClient, google_to_facts

SAMPLE = [
    {"results": [
        {"metrics": {"costMicros": "90000000", "impressions": "40000", "clicks": "900",
                     "conversions": 18.0, "conversionsValue": 300000.0}},
        {"metrics": {"costMicros": "30000000", "impressions": "10000", "clicks": "300",
                     "conversions": 6.0, "conversionsValue": 120000.0}},
    ]}
]


def test_google_mapping_sums_and_micros():
    facts = {f["metric"]: f["value"] for f in google_to_facts("2026-06-17", SAMPLE)}
    assert facts["ad_cost"] == 120.0          # (90M + 30M) / 1e6
    assert facts["impressions"] == 50000.0
    assert facts["clicks"] == 1200.0
    assert facts["conversions"] == 24.0
    assert facts["ad_sales"] == 420000.0
    assert all(f["dims"] == {"channel": "google"} for f in google_to_facts("2026-06-17", SAMPLE))


def test_google_mapping_empty():
    assert google_to_facts("2026-06-17", [{"results": []}]) == []
    assert google_to_facts("2026-06-17", []) == []


def test_google_client_with_mock_transport():
    captured = {}

    def handler(req):
        captured["path"] = req.url.path
        captured["auth"] = req.headers.get("Authorization")
        captured["devtoken"] = req.headers.get("developer-token")
        return httpx.Response(200, json=SAMPLE)

    client = GoogleAdsClient("cust-1", "tok", "dev", transport=httpx.MockTransport(handler))
    facts = {f["metric"]: f["value"] for f in client.fetch_facts("2026-06-17")}
    assert facts["ad_cost"] == 120.0
    assert "customers/cust-1/googleAds:searchStream" in captured["path"]
    assert captured["auth"] == "Bearer tok" and captured["devtoken"] == "dev"
    client.close()
