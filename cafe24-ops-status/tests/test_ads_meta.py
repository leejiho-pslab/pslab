import httpx

from cafe24_ops.clients.ads_meta import MetaAdsClient, meta_insights_to_facts

SAMPLE = {
    "data": [
        {
            "spend": "120000",
            "impressions": "80000",
            "clicks": "1500",
            "actions": [{"action_type": "purchase", "value": "42"}, {"action_type": "link_click", "value": "1500"}],
            "action_values": [{"action_type": "purchase", "value": "560000"}],
        }
    ]
}


def test_meta_mapping_to_facts():
    facts = {f["metric"]: f["value"] for f in meta_insights_to_facts("2026-06-17", SAMPLE)}
    assert facts["ad_cost"] == 120000.0
    assert facts["impressions"] == 80000.0
    assert facts["clicks"] == 1500.0
    assert facts["conversions"] == 42.0       # purchase action count
    assert facts["ad_sales"] == 560000.0      # purchase action value
    # 모든 레코드가 channel=meta 차원을 가진다
    assert all(f["dims"] == {"channel": "meta"} for f in meta_insights_to_facts("2026-06-17", SAMPLE))


def test_meta_mapping_empty():
    assert meta_insights_to_facts("2026-06-17", {"data": []}) == []
    assert meta_insights_to_facts("2026-06-17", {}) == []


def test_meta_client_fetch_with_mock_transport():
    def handler(req):
        assert "/act_123/insights" in req.url.path
        assert req.url.params.get("access_token") == "tok"
        return httpx.Response(200, json=SAMPLE)

    client = MetaAdsClient("123", "tok", transport=httpx.MockTransport(handler))
    facts = {f["metric"]: f["value"] for f in client.fetch_facts("2026-06-17")}
    assert facts["ad_cost"] == 120000.0 and facts["ad_sales"] == 560000.0
    client.close()
