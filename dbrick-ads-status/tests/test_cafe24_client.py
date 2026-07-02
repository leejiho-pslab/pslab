import httpx

from cafe24_ops.clients import Cafe24Client
from cafe24_ops.collectors.cafe24 import (
    order_amount,
    order_breakdowns,
    orders_to_metrics,
    signup_metrics,
    visitor_metrics,
)


def test_order_breakdowns_device_and_customer():
    orders = [
        {"payment_amount": "10000", "order_from_mobile": "T", "first_order": "T"},  # 모바일·신규
        {"payment_amount": "20000", "order_from_mobile": "F", "first_order": "F"},  # PC·재구매
        {"payment_amount": "5000", "order_from_mobile": "T", "first_order": None},   # 모바일·마켓→신규
    ]
    facts = order_breakdowns("2026-06-25", orders)
    dev = {f["dims"]["device"]: f["value"] for f in facts if f["metric"] == "device_sales"}
    cust = {f["dims"]["customer_type"]: f["value"] for f in facts if f["metric"] == "customer_sales"}
    assert dev == {"mobile": 15000.0, "pc": 20000.0}
    assert cust == {"new": 15000.0, "returning": 20000.0}
    assert sum(dev.values()) == sum(cust.values()) == 35000.0


def _client(handler, **kw):
    return Cafe24Client(
        mall_id="keek", client_id="cid", client_secret="sec",
        access_token=kw.pop("access_token", "tok"),
        base_url="https://keek.cafe24api.com",
        transport=httpx.MockTransport(handler), **kw,
    )


def test_count_orders_and_version_header():
    seen = {}

    def handler(req):
        seen["version"] = req.headers.get("X-Cafe24-Api-Version")
        seen["auth"] = req.headers.get("Authorization")
        return httpx.Response(200, json={"count": 7})

    c = _client(handler)
    assert c.count_orders("2026-06-17", "2026-06-17") == 7
    assert seen["version"]  # 버전 헤더가 항상 붙는다
    assert seen["auth"] == "Bearer tok"


def test_pagination_follows_offset():
    def handler(req):
        if req.url.path == "/api/v2/admin/orders":
            offset = int(req.url.params.get("offset", "0"))
            if offset == 0:
                return httpx.Response(200, json={"orders": [{"payment_amount": "100"},
                                                             {"payment_amount": "200"}]})
            return httpx.Response(200, json={"orders": []})
        return httpx.Response(404)

    c = _client(handler)
    orders = c.list_orders("2026-06-17", "2026-06-17", limit=2)  # 2건 == limit → 다음 페이지 요청
    assert len(orders) == 2


def test_auto_refresh_on_401():
    state = {"refreshed": False}

    def handler(req):
        if req.url.path == "/api/v2/oauth/token":
            state["refreshed"] = True
            return httpx.Response(200, json={"access_token": "new", "refresh_token": "newr"})
        if req.headers.get("Authorization") == "Bearer old":
            return httpx.Response(401, json={"error": "invalid_token"})
        if req.headers.get("Authorization") == "Bearer new":
            return httpx.Response(200, json={"count": 5})
        return httpx.Response(403)

    c = _client(handler, access_token="old", refresh_token="r")
    assert c.count_orders("d", "d") == 5
    assert state["refreshed"] is True
    assert c.access_token == "new"


def test_order_amount_field_variants():
    assert order_amount({"payment_amount": "1500"}) == 1500.0
    assert order_amount({"actual_order_amount": {"payment_amount": "900"}}) == 900.0
    assert order_amount({"order_price_amount": "300"}) == 300.0
    assert order_amount({}) == 0.0


def test_orders_to_metrics_maps_sales_count_aov():
    orders = [{"payment_amount": "10000"}, {"payment_amount": "5000"}, {"payment_amount": "5000"}]
    facts = {f["metric"]: f["value"] for f in orders_to_metrics("2026-06-17", orders, order_count=3)}
    assert facts["gross_sales"] == 20000.0
    assert facts["order_count"] == 3.0
    assert facts["aov"] == round(20000.0 / 3, 2)


def test_visitor_metrics_computes_conversion():
    facts = {f["metric"]: f["value"] for f in visitor_metrics("2026-06-17", order_count=20, visitors=1000)}
    assert facts["visitors"] == 1000.0
    assert facts["conversion_rate"] == 2.0  # 20/1000*100
    # 방문자 없음 → 비움 (전환율 계산 불가)
    assert visitor_metrics("2026-06-17", 20, None) == []
    assert visitor_metrics("2026-06-17", 20, 0) == []


def test_signup_metrics_optional():
    assert signup_metrics("2026-06-17", None) == []
    assert signup_metrics("2026-06-17", 7)[0]["value"] == 7.0


def test_visitor_count_disabled_by_default(monkeypatch):
    monkeypatch.delenv("CAFE24_VISITORS_PATH", raising=False)

    def handler(req):  # 호출되면 안 됨
        raise AssertionError("기본값에서는 방문자 엔드포인트를 호출하지 않아야 한다")

    c = _client(handler)
    assert c.get_visitor_count("2026-06-17") is None


def test_visitor_count_enabled_via_env(monkeypatch):
    monkeypatch.setenv("CAFE24_VISITORS_PATH", "/api/v2/admin/reports/visits")

    def handler(req):
        if req.url.path == "/api/v2/admin/reports/visits":
            return httpx.Response(200, json={"visit_count": 1234})
        return httpx.Response(404)

    c = _client(handler)
    assert c.get_visitor_count("2026-06-17") == 1234


def test_count_new_customers_graceful_404():
    def handler(req):
        return httpx.Response(404, json={"error": "not found"})

    c = _client(handler)
    assert c.count_new_customers("2026-06-17", "2026-06-17") is None
