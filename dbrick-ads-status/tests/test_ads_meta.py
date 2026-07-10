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


def test_meta_purchase_action_type_priority():
    # omni_purchase 우선, 픽셀 전환만 있으면 그걸 사용 (합산 아님)
    raw_omni = {"data": [{
        "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "10"},
                    {"action_type": "omni_purchase", "value": "12"}],
        "action_values": [{"action_type": "omni_purchase", "value": "300000"}],
    }]}
    f = {x["metric"]: x["value"] for x in meta_insights_to_facts("2026-06-17", raw_omni)}
    assert f["conversions"] == 12.0 and f["ad_sales"] == 300000.0   # omni 우선

    raw_pixel = {"data": [{
        "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "7"}],
        "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "90000"}],
    }]}
    f2 = {x["metric"]: x["value"] for x in meta_insights_to_facts("2026-06-17", raw_pixel)}
    assert f2["conversions"] == 7.0 and f2["ad_sales"] == 90000.0   # 픽셀 폴백


def test_meta_result_actions_counted_as_conversions():
    # 리드젠(구매 없음): '웹사이트 등록 완료'(complete_registration)가 결과 → 전환수로 집계
    raw = {"data": [{
        "spend": "70000", "impressions": "801", "clicks": "36",
        "actions": [
            {"action_type": "complete_registration", "value": "2"},
            {"action_type": "landing_page_view", "value": "20"},   # 비-리드는 제외
        ],
    }]}
    f = {x["metric"]: x["value"] for x in meta_insights_to_facts("2026-07-05", raw)}
    assert f["conversions"] == 2.0    # 등록 완료 = 전환
    assert f["ad_sales"] == 0.0       # 리드젠은 구매전환값 없음


def test_meta_sums_multiple_result_events_and_ignores_purchase_when_results_exist():
    raw = {"data": [{"actions": [
        {"action_type": "complete_registration", "value": "2"},
        {"action_type": "lead", "value": "1"},
        {"action_type": "onsite_conversion.messaging_conversation_started_7d", "value": "3"},
        {"action_type": "purchase", "value": "5"},   # 결과가 있으면 구매는 무시
    ]}]}
    f = {x["metric"]: x["value"] for x in meta_insights_to_facts("2026-07-05", raw)}
    assert f["conversions"] == 6.0    # 등록2 + 리드1 + 메시지3 (구매5 제외)


def test_meta_falls_back_to_purchase_when_no_results():
    # 순수 이커머스(결과 이벤트 없음)면 기존대로 구매수를 전환수로
    raw = {"data": [{"actions": [{"action_type": "omni_purchase", "value": "9"}]}]}
    f = {x["metric"]: x["value"] for x in meta_insights_to_facts("2026-07-05", raw)}
    assert f["conversions"] == 9.0


def test_meta_strips_act_prefix():
    seen = {}

    def handler(req):
        seen["path"] = req.url.path
        return httpx.Response(200, json=SAMPLE)

    # 입력에 act_ 가 있어도 경로는 act_123 한 번만
    client = MetaAdsClient("act_123", "tok", transport=httpx.MockTransport(handler))
    client.fetch_facts("2026-06-17")
    assert "/act_123/insights" in seen["path"] and "act_act_" not in seen["path"]
    client.close()


def test_meta_client_fetch_with_mock_transport():
    def handler(req):
        assert "/act_123/insights" in req.url.path
        # 토큰은 URL 이 아니라 Authorization 헤더로(로그 노출 방지)
        assert req.url.params.get("access_token") is None
        assert req.headers.get("authorization") == "Bearer tok"
        return httpx.Response(200, json=SAMPLE)

    client = MetaAdsClient("123", "tok", transport=httpx.MockTransport(handler))
    facts = {f["metric"]: f["value"] for f in client.fetch_facts("2026-06-17")}
    assert facts["ad_cost"] == 120000.0 and facts["ad_sales"] == 560000.0
    client.close()


def test_meta_ad_insights_to_facts():
    from cafe24_ops.clients.ads_meta import meta_ad_insights_to_facts
    raw = {"data": [{
        "ad_id": "123", "ad_name": "겨울 아우터 A",
        "spend": "344662", "impressions": "10000", "clicks": "411",
        "actions": [{"action_type": "omni_purchase", "value": "28"}],
        "action_values": [{"action_type": "omni_purchase", "value": "1237385"}],
    }]}
    facts = meta_ad_insights_to_facts("2026-06-28", raw, {"123": "http://img/a.jpg"})
    assert all(f["source"] == "creative" for f in facts)
    m = {f["metric"]: f["value"] for f in facts}
    assert m["ad_cost"] == 344662 and m["conversions"] == 28 and m["ad_sales"] == 1237385
    d0 = facts[0]["dims"]
    assert d0["creative_id"] == "123" and d0["name"] == "겨울 아우터 A" and d0["thumb"] == "http://img/a.jpg"
    assert meta_ad_insights_to_facts("2026-06-28", {"data": []}) == []


def test_meta_ad_insights_counts_result_conversions_like_account():
    # 리드젠: 소재(ad) 레벨도 계정 레벨과 동일하게 '결과'(등록/리드/문의)를 전환수로 집계
    from cafe24_ops.clients.ads_meta import meta_ad_insights_to_facts
    raw = {"data": [{
        "ad_id": "555", "ad_name": "상담 유도 A",
        "spend": "50000", "impressions": "3000", "clicks": "120",
        "actions": [
            {"action_type": "complete_registration", "value": "3"},
            {"action_type": "lead", "value": "2"},
            {"action_type": "landing_page_view", "value": "80"},  # 비-리드 제외
        ],
    }]}
    m = {f["metric"]: f["value"] for f in meta_ad_insights_to_facts("2026-07-05", raw)}
    assert m["conversions"] == 5.0    # 등록3 + 리드2 (구매 없음)
    assert m["ad_sales"] == 0.0


def test_meta_conversions_suffix_fallback_for_pixel_raw_names():
    # 소재 레벨이 통합 이름 없이 픽셀 원시 이름만 줄 때도 접미사 매칭으로 폴백 집계
    from cafe24_ops.clients.ads_meta import _conversions
    actions = [
        {"action_type": "offsite_conversion.fb_pixel_complete_registration", "value": "4"},
        {"action_type": "offsite_conversion.fb_pixel_lead", "value": "1"},
        {"action_type": "landing_page_view", "value": "40"},
    ]
    assert _conversions(actions) == 5.0


def test_meta_conversions_no_double_count_when_both_omni_and_pixel_present():
    # 통합(complete_registration)이 있으면 접미사 폴백까지 가지 않아 이중집계 없음
    from cafe24_ops.clients.ads_meta import _conversions
    actions = [
        {"action_type": "complete_registration", "value": "3"},
        {"action_type": "offsite_conversion.fb_pixel_complete_registration", "value": "3"},
    ]
    assert _conversions(actions) == 3.0
