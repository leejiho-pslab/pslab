import httpx

from cafe24_ops.clients.ads_naver import NaverSearchAdClient, naver_sa_to_facts, sign
from cafe24_ops.clients.ads_kakao import KakaoMomentClient, kakao_to_facts


# ── Naver SearchAd ──────────────────────────────────────────────
def test_naver_sa_signature_stable():
    # 동일 입력 → 동일 서명, base64 형식
    s1 = sign("secret", "1700000000000", "GET", "/stats")
    s2 = sign("secret", "1700000000000", "GET", "/stats")
    assert s1 == s2 and len(s1) > 20


def test_naver_sa_mapping():
    raw = {"data": [{"impCnt": "30000", "clkCnt": "800", "salesAmt": "150000", "ccnt": "12", "convAmt": "400000"}]}
    f = {x["metric"]: x["value"] for x in naver_sa_to_facts("2026-06-17", raw)}
    assert f["impressions"] == 30000.0 and f["clicks"] == 800.0
    assert f["ad_cost"] == 150000.0 and f["conversions"] == 12.0 and f["ad_sales"] == 400000.0
    assert all(x["dims"] == {"channel": "naver"} for x in naver_sa_to_facts("2026-06-17", raw))


def test_naver_sa_client_flow():
    def handler(req):
        assert req.headers.get("X-API-KEY") == "key"
        assert req.headers.get("X-Signature")
        if req.url.path == "/ncc/campaigns":
            return httpx.Response(200, json=[{"nccCampaignId": "cmp-1"}])
        if req.url.path == "/stats":
            # ids 는 배열(반복 파라미터)로 와야 함
            assert req.url.params.get_list("ids") == ["cmp-1"]
            return httpx.Response(200, json={"data": [{"impCnt": "100", "clkCnt": "5", "salesAmt": "1000", "ccnt": "1", "convAmt": "5000"}]})
        return httpx.Response(404)

    c = NaverSearchAdClient("key", "sec", "cust", timestamp_fn=lambda: "1700000000000",
                            transport=httpx.MockTransport(handler))
    facts = {x["metric"]: x["value"] for x in c.fetch_facts("2026-06-17")}
    assert facts["ad_cost"] == 1000.0 and facts["ad_sales"] == 5000.0
    c.close()


def test_naver_sa_chunks_over_100_ids():
    calls = {"stats": 0}

    def handler(req):
        if req.url.path == "/ncc/campaigns":
            return httpx.Response(200, json=[{"nccCampaignId": f"c{i}"} for i in range(150)])
        if req.url.path == "/stats":
            calls["stats"] += 1
            n = len(req.url.params.get_list("ids"))
            assert n <= 100
            return httpx.Response(200, json={"data": [{"salesAmt": "10", "convAmt": "0"}]})
        return httpx.Response(404)

    c = NaverSearchAdClient("key", "sec", "cust", timestamp_fn=lambda: "1",
                            transport=httpx.MockTransport(handler))
    facts = {x["metric"]: x["value"] for x in c.fetch_facts("2026-06-17")}
    assert calls["stats"] == 2            # 150개 → 100 + 50 두 번 호출
    assert facts["ad_cost"] == 20.0       # 10 + 10 합산
    c.close()


# ── Kakao Moment ────────────────────────────────────────────────
def test_kakao_mapping():
    raw = {"data": [{"metrics": {"imp": 20000, "click": 600, "cost": 90000, "conv_purchase": 8, "conv_purchase_price": 250000}}]}
    f = {x["metric"]: x["value"] for x in kakao_to_facts("2026-06-17", raw)}
    assert f["impressions"] == 20000.0 and f["clicks"] == 600.0
    assert f["ad_cost"] == 90000.0 and f["conversions"] == 8.0 and f["ad_sales"] == 250000.0


def test_kakao_client_flow():
    def handler(req):
        assert req.headers.get("Authorization") == "Bearer tok"
        assert req.headers.get("adAccountId") == "acc-1"
        return httpx.Response(200, json={"data": [{"metrics": {"imp": 100, "click": 5, "cost": 1000, "conv_purchase": 1, "conv_purchase_price": 5000}}]})

    c = KakaoMomentClient("tok", "acc-1", transport=httpx.MockTransport(handler))
    facts = {x["metric"]: x["value"] for x in c.fetch_facts("2026-06-17")}
    assert facts["ad_cost"] == 1000.0 and facts["ad_sales"] == 5000.0
    c.close()
