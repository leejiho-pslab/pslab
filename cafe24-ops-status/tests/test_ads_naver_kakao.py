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


def test_naver_sa_splits_powerlink_place_by_campaign_type():
    """campaignTp=WEB_SITE→네이버 파워링크, PLACE→네이버 플레이스로 분리 집계돼야 한다."""
    def handler(req):
        if req.url.path == "/ncc/campaigns":
            return httpx.Response(200, json=[
                {"nccCampaignId": "web-1", "campaignTp": "WEB_SITE"},
                {"nccCampaignId": "place-1", "campaignTp": "PLACE"},
                {"nccCampaignId": "shop-1", "campaignTp": "SHOPPING"},
            ])
        if req.url.path == "/stats":
            ids = req.url.params.get_list("ids")
            amounts = {"web-1": "1000", "place-1": "500", "shop-1": "200"}
            assert len(ids) == 1  # 이 테스트에선 채널별로 캠페인이 하나씩
            return httpx.Response(200, json={"data": [{"salesAmt": amounts[ids[0]], "convAmt": "0"}]})
        return httpx.Response(404)

    c = NaverSearchAdClient("key", "sec", "cust", timestamp_fn=lambda: "1",
                            transport=httpx.MockTransport(handler))
    facts = c.fetch_facts("2026-06-17")
    ad_cost_by_channel = {
        f["dims"]["channel"]: f["value"] for f in facts if f["metric"] == "ad_cost"
    }
    assert ad_cost_by_channel == {
        "naver_powerlink": 1000.0,
        "naver_place": 500.0,
        "naver_other": 200.0,   # 쇼핑 등 그 외 유형도 광고비가 사라지지 않고 남는다
    }
    c.close()


def test_naver_sa_fetch_keyword_facts_full_hierarchy():
    """캠페인→광고그룹→키워드 계층을 따라가 키워드별 facts 를 만들어야 한다."""
    def handler(req):
        path = req.url.path
        if path == "/ncc/campaigns":
            return httpx.Response(200, json=[
                {"nccCampaignId": "cmp-1", "campaignTp": "WEB_SITE"},
                {"nccCampaignId": "cmp-2", "campaignTp": "SHOPPING"},  # 파워링크/플레이스 아니므로 제외
            ])
        if path == "/ncc/adgroups":
            assert req.url.params.get("nccCampaignId") == "cmp-1"
            return httpx.Response(200, json=[{"nccAdgroupId": "grp-1", "name": "겨울신상"}])
        if path == "/ncc/keywords":
            assert req.url.params.get("nccAdgroupId") == "grp-1"
            return httpx.Response(200, json=[
                {"nccKeywordId": "kw-1", "keyword": "keek 목베개"},
                {"nccKeywordId": "kw-2", "keyword": "여행 목베개"},
            ])
        if path == "/stats":
            ids = req.url.params.get_list("ids")
            assert ids == ["kw-1", "kw-2"]
            return httpx.Response(200, json={"data": [
                {"salesAmt": "1000", "impCnt": "100", "clkCnt": "10", "ccnt": "1"},
                {"salesAmt": "500", "impCnt": "50", "clkCnt": "5", "ccnt": "0"},
            ]})
        return httpx.Response(404)

    c = NaverSearchAdClient("key", "sec", "cust", timestamp_fn=lambda: "1",
                            transport=httpx.MockTransport(handler))
    facts = c.fetch_keyword_facts("2026-06-17")
    by_kw = {f["dims"]["keyword"]: f["value"] for f in facts if f["metric"] == "ad_cost"}
    assert by_kw == {"keek 목베개": 1000.0, "여행 목베개": 500.0}
    assert all(f["dims"]["adgroup"] == "겨울신상" for f in facts)
    assert all(f["dims"]["channel"] == "naver_powerlink" for f in facts)
    c.close()


def test_naver_sa_match_rows_to_ids_by_id_field():
    rows = [{"id": "kw-2", "impCnt": "5"}, {"id": "kw-1", "impCnt": "10"}]
    matched = NaverSearchAdClient._match_rows_to_ids(["kw-1", "kw-2"], rows)
    assert matched["kw-1"]["impCnt"] == "10" and matched["kw-2"]["impCnt"] == "5"


def test_naver_sa_match_rows_to_ids_positional_fallback():
    rows = [{"impCnt": "10"}, {"impCnt": "5"}]
    matched = NaverSearchAdClient._match_rows_to_ids(["kw-1", "kw-2"], rows)
    assert matched["kw-1"]["impCnt"] == "10" and matched["kw-2"]["impCnt"] == "5"


def test_naver_sa_match_rows_to_ids_empty_rows_is_no_activity_not_a_warning(caplog):
    """행 0개는 매칭 실패가 아니라 '그 배치 전부 그 날 활동 없음' — 경고 없이 조용히 스킵."""
    import logging

    with caplog.at_level(logging.WARNING):
        matched = NaverSearchAdClient._match_rows_to_ids(["kw-1", "kw-2"], [])
    assert matched == {}
    assert not caplog.records


def test_naver_sa_match_rows_to_ids_length_mismatch_skips():
    rows = [{"impCnt": "10"}]
    matched = NaverSearchAdClient._match_rows_to_ids(["kw-1", "kw-2"], rows)
    assert matched == {}


def test_naver_sa_from_account_enables_request_throttle(monkeypatch):
    """라이브 경로(from_account)만 요청 간격을 강제한다 — 직접 생성(테스트)은 즉시 실행."""
    monkeypatch.setenv("NAVER_SA_API_KEY", "k")
    monkeypatch.setenv("NAVER_SA_SECRET_KEY", "s")
    c = NaverSearchAdClient.from_account({"account_id": "cust"})
    assert c._request_interval > 0
    c.close()

    c2 = NaverSearchAdClient("key", "sec", "cust")
    assert c2._request_interval == 0
    c2.close()


def test_naver_sa_get_throttles_between_calls():
    """request_interval > 0 이면 연속 호출 사이 최소 간격을 지킨다."""
    import time

    def handler(req):
        return httpx.Response(200, json={"data": []})

    c = NaverSearchAdClient("key", "sec", "cust", timestamp_fn=lambda: "1",
                            transport=httpx.MockTransport(handler), request_interval=0.2)
    start = time.monotonic()
    c._get("/ncc/campaigns", {})
    c._get("/ncc/campaigns", {})
    elapsed = time.monotonic() - start
    assert elapsed >= 0.2
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
