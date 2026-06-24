import httpx

from cafe24_ops.clients.naver_search import (
    NaverSearchClient,
    blog_to_reviews,
    shop_to_bestsellers,
)


def test_shop_to_bestsellers_strips_tags_and_ranks():
    raw = {"items": [
        {"title": "<b>컴포트랩</b> 나시탑", "lprice": "18900"},
        {"title": "컴포트랩 골지탑", "lprice": "35900"},
        {"title": "여분상품", "lprice": "1000"},
        {"title": "넘치는상품", "lprice": "2000"},
    ]}
    facts = shop_to_bestsellers("2026-06-23", "컴포트랩", raw, top=3)
    assert len(facts) == 3
    assert facts[0]["dims"]["product"] == "컴포트랩 나시탑"   # <b> 제거
    assert facts[0]["value"] == 1.0 and facts[1]["value"] == 2.0
    assert facts[0]["dims"]["price"] == 18900.0
    assert all(f["metric"] == "bestseller" for f in facts)


def test_blog_to_reviews_counts_today_only():
    raw = {"items": [
        {"postdate": "20260623"}, {"postdate": "20260623"},
        {"postdate": "20260601"}, {"postdate": ""},
    ]}
    facts = blog_to_reviews("2026-06-23", "컴포트랩", raw)
    assert len(facts) == 1
    assert facts[0]["metric"] == "new_reviews" and facts[0]["value"] == 2.0
    assert facts[0]["dims"] == {"competitor": "컴포트랩"}


def test_client_fetch_competitor_facts():
    def handler(req):
        assert req.headers.get("X-Naver-Client-Id") == "cid"
        if "/v1/search/shop.json" in req.url.path:
            return httpx.Response(200, json={"items": [{"title": "<b>A</b>", "lprice": "100"}]})
        if "/v1/search/blog.json" in req.url.path:
            return httpx.Response(200, json={"items": [{"postdate": "20260623"}]})
        return httpx.Response(404)

    c = NaverSearchClient("cid", "sec", transport=httpx.MockTransport(handler))
    facts = c.fetch_competitor_facts("2026-06-23", ["컴포트랩"])
    metrics = {f["metric"] for f in facts}
    assert metrics == {"bestseller", "new_reviews"}
    c.close()
