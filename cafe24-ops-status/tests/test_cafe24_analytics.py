"""카페24 접속통계 — 클라이언트 파싱 + 집계.

핵심은 **상품별 담기율**이다(GA4 가 지목한 '장바구니 담기' 병목을 상품 단위로 특정).
기간 담기율은 일자별 비율을 더하면 안 되고 조회수 기준으로 다시 계산해야 한다.
"""
import httpx

from cafe24_ops.clients.cafe24_analytics import Cafe24AnalyticsClient
from cafe24_ops.config import load_config
from cafe24_ops.etl.cafe24_analytics import (
    ad_paths,
    cart_bottleneck,
    member_split,
    page_report,
    product_funnel,
    referrer_domains,
    search_keywords,
    visit_summary,
    visit_trend,
)
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store

DAYS = ("2026-07-20", "2026-07-21", "2026-07-22")


def _seeded(tmp_path, days=DAYS):
    cfg = load_config()
    store = Store(tmp_path)
    for d in days:
        run_pipeline(d, cfg, store, mode="mock")
    return store


class _FakeAdmin:
    """Analytics 클라이언트는 Admin 클라이언트에서 토큰만 빌려 쓴다."""
    mall_id = "testmall"
    access_token = "TOK"

    def get(self, *a, **k):  # 401 재시도 경로용
        return {}


def _client(handler):
    return Cafe24AnalyticsClient(_FakeAdmin(), transport=httpx.MockTransport(handler))


# ── 클라이언트 파싱 ────────────────────────────────────────────
def test_cart_actions_parses_string_rate():
    """add_cart_rate 가 문자열("1.02")로 온다 — 숫자로 변환돼야 한다."""
    def handler(req):
        assert req.url.path == "/carts/action"
        return httpx.Response(200, json={"action": [
            {"product_no": 1833, "product_name": "Windbreaker V3",
             "count": 2558, "add_cart_count": 26, "add_cart_rate": "1.02"},
        ]})

    c = _client(handler)
    rows = c.cart_actions("2026-07-23", "2026-07-29")
    assert rows == [{"product_no": 1833, "product_name": "Windbreaker V3",
                     "views": 2558.0, "cart_adds": 26.0, "cart_rate": 1.02}]
    c.close()


def test_product_sales_parses_string_amount():
    def handler(req):
        return httpx.Response(200, json={"sales": [
            {"product_no": 1833, "product_name": "A", "order_count": 11,
             "order_product_count": 12, "order_amount": "1908000"},
        ]})

    c = _client(handler)
    assert c.product_sales("2026-07-23", "2026-07-29")[0]["amount"] == 1908000.0
    c.close()


def test_visitors_trims_timestamp_to_date():
    def handler(req):
        return httpx.Response(200, json={"view": [
            {"date": "2026-07-23T00:00+09:00", "visit_count": 2301,
             "first_visit_count": 1199, "re_visit_count": 1102},
        ]})

    c = _client(handler)
    assert c.daily_visitors("2026-07-23", "2026-07-23")[0]["date"] == "2026-07-23"
    c.close()


def test_scope_error_is_recorded_not_raised():
    """403 INVALID SCOPE 는 예외로 올리지 않고 부분 실패로만 남긴다
    (통계는 보조 지표라 하루 수집 전체를 막으면 안 된다)."""
    def handler(req):
        return httpx.Response(403, json={"error": {"code": 403, "message": "INVALID SCOPE"}})

    c = _client(handler)
    assert c.search_keywords("2026-07-23", "2026-07-29") == []
    assert "403" in (c.last_partial_error or "")
    c.close()


def test_member_sales_returns_none_when_empty():
    c = _client(lambda req: httpx.Response(200, json={"sales": []}))
    assert c.member_sales("2026-07-23", "2026-07-29") is None
    c.close()


# ── 집계: 방문 ────────────────────────────────────────────────
def test_visit_summary_and_trend(tmp_path):
    store = _seeded(tmp_path)
    try:
        s = visit_summary(store, *(DAYS[0], DAYS[-1]))
        assert s["days"] == 3 and s["visits"] > 0
        assert s["visits"] == s["first_visits"] + s["re_visits"]
        assert 0 < s["re_visit_rate"] < 100
        assert [r["date"] for r in visit_trend(store, DAYS[0], DAYS[-1])] == list(DAYS)
    finally:
        store.close()


# ── 집계: 유입 ────────────────────────────────────────────────
def test_search_keywords_ranked_with_share(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = search_keywords(store, DAYS[0], DAYS[-1], limit=5)
        assert rows and rows == sorted(rows, key=lambda x: -x["visits"])
        assert len(rows) <= 5
        assert 0 < rows[0]["share"] <= 100
        assert rows[0]["name"]
    finally:
        store.close()


def test_new_entrant_flagged_against_comparison(tmp_path):
    """비교기간에 없던 검색어는 is_new — '새로 뜨는 말'을 놓치지 않도록."""
    store = _seeded(tmp_path)
    try:
        rows = search_keywords(store, DAYS[-1], DAYS[-1], DAYS[0], DAYS[0])
        assert all(r["is_new"] is False or r["prev_visits"] is None for r in rows)
        # 비교기간을 안 주면 증감/신규 판정을 하지 않는다
        plain = search_keywords(store, DAYS[0], DAYS[-1])
        assert all(r["delta"] is None and r["is_new"] is False for r in plain)
    finally:
        store.close()


def test_referrers_and_ad_paths(tmp_path):
    store = _seeded(tmp_path)
    try:
        assert referrer_domains(store, DAYS[0], DAYS[-1])
        ads = ad_paths(store, DAYS[0], DAYS[-1])
        assert ads and any(r["name"] == "criteo" for r in ads)
    finally:
        store.close()


def test_page_report_views_per_visit(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = page_report(store, DAYS[0], DAYS[-1], limit=3)
        assert len(rows) == 3
        assert all(r["views_per_visit"] >= 1 for r in rows)
    finally:
        store.close()


# ── 집계: 상품 퍼널 (핵심) ────────────────────────────────────
def test_product_funnel_recomputes_rates_from_totals(tmp_path):
    """담기율은 기간 합계(담기/조회)로 다시 계산해야 한다 — 일자 비율 합산은 틀린 값."""
    store = _seeded(tmp_path)
    try:
        rows = product_funnel(store, DAYS[0], DAYS[-1], min_views=0)
        assert rows
        for r in rows:
            assert r["cart_adds"] <= r["views"]
            expected = round(r["cart_adds"] / r["views"] * 100, 2)
            assert r["cart_rate"] == expected
            assert 0 <= r["cart_rate"] <= 100          # 비율 합산 버그면 100을 넘는다
    finally:
        store.close()


def test_product_funnel_filters_low_traffic(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = product_funnel(store, DAYS[0], DAYS[-1], min_views=1_000_000)
        assert rows == []      # 조회 적은 상품은 비율이 요동쳐 제외
    finally:
        store.close()


def test_cart_bottleneck_flags_laggards_by_median(tmp_path):
    store = _seeded(tmp_path)
    try:
        b = cart_bottleneck(store, DAYS[0], DAYS[-1], min_views=0)
        assert b["total_views"] > 0
        assert b["cart_rate"] is not None and b["median_cart_rate"] is not None
        # 지목된 상품은 모두 중위값 절반 미만이어야 한다
        assert all(r["cart_rate"] < b["median_cart_rate"] / 2 for r in b["laggards"])
        assert len(b["laggards"]) <= 5
    finally:
        store.close()


def test_cart_bottleneck_safe_when_no_data(tmp_path):
    store = Store(tmp_path)
    try:
        b = cart_bottleneck(store, DAYS[0], DAYS[-1])
        assert b["laggards"] == [] and b["cart_rate"] is None
    finally:
        store.close()


# ── 집계: 회원/비회원 ─────────────────────────────────────────
def test_member_split_shares(tmp_path):
    store = _seeded(tmp_path)
    try:
        m = member_split(store, DAYS[0], DAYS[-1])
        total = m["member_orders"] + m["nonmember_orders"]
        if total:
            assert 0 <= m["nonmember_order_share"] <= 100
        assert m["member_amount"] >= 0 and m["nonmember_amount"] >= 0
    finally:
        store.close()
