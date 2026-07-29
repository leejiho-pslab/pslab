import httpx

from cafe24_ops.clients.ga4 import (
    GA4Client,
    ga4_report_to_event_by_source,
    ga4_report_to_site_metrics,
    ga4_report_to_top_pages,
)
from cafe24_ops.config import load_config
from cafe24_ops.etl.ga4_site import (
    channel_breakdown,
    classify_source_medium,
    site_summary,
    site_trend,
    source_medium_breakdown,
    top_pages,
)
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def _seeded(tmp_path, days=("2026-07-20", "2026-07-21", "2026-07-22")):
    cfg = load_config()
    store = Store(tmp_path)
    for d in days:
        run_pipeline(d, cfg, store, mode="mock")
    return store


# ── 응답 파서(순수함수) ────────────────────────────────────────
def test_site_metrics_parses_in_declared_order():
    raw = {"rows": [{"metricValues": [{"value": "1500"}, {"value": "1800"},
                                      {"value": "5400"}, {"value": "63.5"}]}]}
    m = ga4_report_to_site_metrics(raw)
    assert m["site_visitors"] == 1500.0 and m["site_sessions"] == 1800.0
    assert m["site_page_views"] == 5400.0 and m["site_avg_duration"] == 63.5


def test_site_metrics_returns_none_when_no_rows():
    assert ga4_report_to_site_metrics({"rows": []}) is None


def test_event_by_source_sums_per_source_medium():
    raw = {"rows": [
        {"dimensionValues": [{"value": "sns / meta"}], "metricValues": [{"value": "7"}]},
        {"dimensionValues": [{"value": "criteo / display"}], "metricValues": [{"value": "2"}]},
    ]}
    assert ga4_report_to_event_by_source(raw) == {"sns / meta": 7.0, "criteo / display": 2.0}


def test_top_pages_skips_blank_titles():
    raw = {"rows": [
        {"dimensionValues": [{"value": "keek | 공식몰"}], "metricValues": [{"value": "300"}]},
        {"dimensionValues": [{"value": ""}], "metricValues": [{"value": "50"}]},
    ]}
    assert ga4_report_to_top_pages(raw) == [{"page": "keek | 공식몰", "views": 300.0}]


# ── 전환 = 결제완료 이벤트만 (keyEvents 부풀림 회피) ─────────────
def test_conversions_query_filters_to_purchase_event_only():
    """GA4 keyEvents 지표가 아니라 결제완료 eventName 필터로 조회해야 한다."""
    seen = {}

    def handler(req):
        body = req.read().decode()
        seen["body"] = body
        return httpx.Response(200, json={"rows": [
            {"dimensionValues": [{"value": "sns / meta"}], "metricValues": [{"value": "5"}]}]})

    c = GA4Client("123", {}, transport=httpx.MockTransport(handler), token_fn=lambda: "tok")
    out = c.daily_conversions_by_source("2026-07-20")
    assert out == {"sns / meta": 5.0}
    # keyEvents/conversions 지표를 쓰지 않고 eventName 필터를 걸었는지
    assert "eventName" in seen["body"] and "결제완료" in seen["body"]
    assert "keyEvents" not in seen["body"]
    c.close()


def test_source_medium_merges_sessions_with_purchase_conversions():
    """세션은 전체 기준, 전환은 결제완료 기준으로 합쳐져야 한다."""
    def handler(req):
        body = req.read().decode()
        if "eventName" in body:  # 전환 조회
            return httpx.Response(200, json={"rows": [
                {"dimensionValues": [{"value": "sns / meta"}], "metricValues": [{"value": "3"}]}]})
        return httpx.Response(200, json={"rows": [
            {"dimensionValues": [{"value": "sns / meta"}],
             "metricValues": [{"value": "100"}, {"value": "80"}]},
            {"dimensionValues": [{"value": "criteo / display"}],
             "metricValues": [{"value": "500"}, {"value": "450"}]},
        ]})

    c = GA4Client("123", {}, transport=httpx.MockTransport(handler), token_fn=lambda: "tok")
    rows = {r["source_medium"]: r for r in c.daily_source_medium("2026-07-20")}
    assert rows["sns / meta"]["sessions"] == 100.0 and rows["sns / meta"]["conversions"] == 3.0
    # 전환 이벤트가 없던 매체는 0 (누락이 아니라 실제 0)
    assert rows["criteo / display"]["sessions"] == 500.0
    assert rows["criteo / display"]["conversions"] == 0.0
    c.close()


# ── 채널 매핑 ─────────────────────────────────────────────────
def test_classify_maps_keek_real_source_mediums():
    assert classify_source_medium("criteo / display")[0] == "criteo"
    assert classify_source_medium("sns / meta")[0] == "meta"
    assert classify_source_medium("ig / paid")[0] == "meta"          # 인스타 유료도 Meta 로
    assert classify_source_medium("naver / gfa")[0] == "naver_gfa"
    assert classify_source_medium("KK_powerlink_MO / powerlink")[0] == "naver_powerlink"
    assert classify_source_medium("KK_BS_MO / bs")[0] == "naver_brandsearch"
    assert classify_source_medium("(direct) / (none)")[0] == "direct"


def test_classify_unknown_falls_back_to_etc():
    assert classify_source_medium("무언가 / 새매체") == ("etc", "기타")


# ── 집계 ──────────────────────────────────────────────────────
def test_site_summary_and_trend(tmp_path):
    store = _seeded(tmp_path)
    try:
        s = site_summary(store, "2026-07-20", "2026-07-22")
        assert s["days"] == 3 and s["sessions"] > 0 and s["visitors"] > 0
        assert s["avg_session_duration"] is not None
        assert s["pages_per_session"] is not None
        rows = site_trend(store, "2026-07-20", "2026-07-22")
        assert [r["date"] for r in rows] == ["2026-07-20", "2026-07-21", "2026-07-22"]
    finally:
        store.close()


def test_source_medium_breakdown_sorted_and_labelled(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = source_medium_breakdown(store, "2026-07-20", "2026-07-22")
        assert rows and rows == sorted(rows, key=lambda x: -x["sessions"])
        meta = next(r for r in rows if r["source_medium"] == "sns / meta")
        assert meta["channel"] == "meta" and meta["is_ad"] is True
        direct = next(r for r in rows if r["source_medium"] == "(direct) / (none)")
        assert direct["is_ad"] is False   # 직접 유입은 광고가 아님
    finally:
        store.close()


def test_channel_breakdown_merges_meta_sources(tmp_path):
    """sns/meta 와 ig/paid 는 같은 Meta 채널로 합쳐져야 한다."""
    store = _seeded(tmp_path)
    try:
        rows = source_medium_breakdown(store, "2026-07-20", "2026-07-22")
        meta_sessions = sum(r["sessions"] for r in rows if r["channel"] == "meta")
        merged = {c["channel"]: c for c in channel_breakdown(store, "2026-07-20", "2026-07-22")}
        assert merged["meta"]["sessions"] == meta_sessions
        assert len(merged["meta"]["source_mediums"]) == 2  # sns/meta + ig/paid
    finally:
        store.close()


def test_top_pages_limit(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = top_pages(store, "2026-07-20", "2026-07-22", limit=3)
        assert len(rows) == 3
        assert rows == sorted(rows, key=lambda x: -x["views"])
    finally:
        store.close()
