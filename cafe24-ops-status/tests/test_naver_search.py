import httpx

from cafe24_ops.clients.naver_search import (
    NaverSearchClient,
    blog_to_reviews,
    is_relevant,
    shop_to_bestsellers,
    shop_to_promotions,
)


def test_is_relevant_exact_match_filters_noise():
    # '컴포트'는 매칭되면 안 되고 '컴포트랩'만 관련
    assert is_relevant({"title": "<b>컴포트랩</b> 나시탑"}, "컴포트랩")
    assert not is_relevant({"title": "아디다스 컴포트 슬리퍼"}, "컴포트랩")
    assert is_relevant({"title": "x", "description": "컴 포 트 랩 후기"}, "컴포트랩")  # 공백 무시
    # 제목엔 없지만 brand/mallName 에 있으면 관련(쇼핑 응답)
    assert is_relevant({"title": "[화사Pick] 듀얼쿨 튜브탑", "mallName": "컴포트랩"}, "컴포트랩")


def test_shop_to_bestsellers_filters_and_ranks():
    raw = {"items": [
        {"title": "<b>컴포트랩</b> 나시탑", "lprice": "18900"},
        {"title": "무관한 컴포트 베개", "lprice": "9900"},        # 제외
        {"title": "컴포트랩 골지탑", "lprice": "35900"},
    ]}
    facts = shop_to_bestsellers("2026-06-23", "컴포트랩", raw, top=3)
    assert [f["dims"]["product"] for f in facts] == ["컴포트랩 나시탑", "컴포트랩 골지탑"]
    assert facts[0]["value"] == 1.0 and facts[0]["dims"]["price"] == 18900.0


def test_shop_to_promotions_counts_discount_signals():
    raw = {"items": [
        {"title": "컴포트랩 듀얼쿨 튜브탑 할인"},
        {"title": "컴포트랩 1+1 기획전"},
        {"title": "컴포트랩 기본 나시탑"},          # 신호 없음
        {"title": "무관 세일 상품"},                 # 관련 아님 → 제외
    ]}
    facts = shop_to_promotions("2026-06-23", "컴포트랩", raw)
    assert facts[0]["metric"] == "active_promotions" and facts[0]["value"] == 2.0


def test_blog_to_reviews_counts_today_relevant_only():
    raw = {"items": [
        {"postdate": "20260623", "title": "컴포트랩 후기"},
        {"postdate": "20260623", "title": "아디다스 컴포트 슬리퍼"},  # 관련 아님 → 제외
        {"postdate": "20260601", "title": "컴포트랩 후기"},           # 다른 날 → 제외
    ]}
    facts = blog_to_reviews("2026-06-23", "컴포트랩", raw)
    assert facts[0]["metric"] == "new_reviews" and facts[0]["value"] == 1.0


def test_client_fetch_competitor_facts_isolated():
    def handler(req):
        assert req.headers.get("X-Naver-Client-Id") == "cid"
        if "/v1/search/shop.json" in req.url.path:
            return httpx.Response(200, json={"items": [{"title": "<b>컴포트랩</b> 할인", "lprice": "100"}]})
        if "/v1/search/blog.json" in req.url.path:
            return httpx.Response(200, json={"items": [{"postdate": "20260623", "title": "컴포트랩"}]})
        return httpx.Response(404)

    c = NaverSearchClient("cid", "sec", transport=httpx.MockTransport(handler))
    facts = c.fetch_competitor_facts("2026-06-23", ["컴포트랩"])
    metrics = {f["metric"] for f in facts}
    assert metrics == {"bestseller", "active_promotions", "new_reviews"}
    c.close()


def test_client_fetch_survives_one_failure():
    # shop 500 → 해당 경쟁사 스킵, 다음 경쟁사는 계속
    def handler(req):
        if "B" in req.url.params.get("query", "") and "shop" in req.url.path:
            return httpx.Response(500)
        if "shop" in req.url.path:
            return httpx.Response(200, json={"items": [{"title": "A 할인", "lprice": "1"}]})
        return httpx.Response(200, json={"items": []})

    c = NaverSearchClient("cid", "sec", transport=httpx.MockTransport(handler))
    facts = c.fetch_competitor_facts("2026-06-23", ["A", "B"])
    comps = {f["dims"]["competitor"] for f in facts}
    assert "A" in comps  # A 는 수집됨, B 실패는 격리
    c.close()
