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
    entry_paths,
    exit_pages,
    funnel_by_channel,
    prev_period,
    purchase_funnel,
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


# ── 비교기간 ──────────────────────────────────────────────────
def test_prev_period_is_same_length_and_adjacent():
    assert prev_period("2026-07-20", "2026-07-26") == ("2026-07-13", "2026-07-19")
    assert prev_period("2026-07-20", "2026-07-20") == ("2026-07-19", "2026-07-19")


# ── 이탈 페이지 ────────────────────────────────────────────────
_WEEK = tuple(f"2026-07-{d:02d}" for d in range(14, 27))  # 07-14 ~ 07-26


def _seeded_two_periods(tmp_path):
    return _seeded(tmp_path, days=_WEEK)


def test_exit_pages_ranks_worsening_first_and_reports_delta(tmp_path):
    store = _seeded_two_periods(tmp_path)
    try:
        rows = exit_pages(store, "2026-07-21", "2026-07-26", "2026-07-14", "2026-07-20")
        assert rows, "랜딩페이지 데이터가 있어야 한다"
        assert all(r["sessions"] >= 30 for r in rows)      # 세션 적은 페이지는 제외
        assert all(0 <= r["bounce_rate"] <= 100 for r in rows)
        deltas = [r["bounce_delta"] for r in rows if r["bounce_delta"] is not None]
        assert deltas == sorted(deltas, reverse=True)      # 악화(증가)한 페이지가 위로
    finally:
        store.close()


def test_exit_pages_without_comparison_leaves_delta_none(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = exit_pages(store, "2026-07-20", "2026-07-22")
        assert rows and all(r["bounce_delta"] is None for r in rows)
        assert all(r["prev_bounce_rate"] is None for r in rows)
    finally:
        store.close()


# ── 유입 경로 ──────────────────────────────────────────────────
def test_entry_paths_groups_by_channel_with_page_shares(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = entry_paths(store, "2026-07-20", "2026-07-22", limit_per_channel=2)
        assert rows and rows == sorted(rows, key=lambda x: -x["sessions"])
        top = rows[0]
        assert len(top["pages"]) <= 2
        assert top["pages"] == sorted(top["pages"], key=lambda p: -p["sessions"])
        assert 0 < top["pages"][0]["share"] <= 100
        assert any(r["is_ad"] for r in rows)   # 광고 채널이 구분돼야 한다
    finally:
        store.close()


# ── 구매 퍼널 ──────────────────────────────────────────────────
def test_purchase_funnel_steps_decrease_and_report_rates(tmp_path):
    store = _seeded(tmp_path)
    try:
        f = purchase_funnel(store, "2026-07-20", "2026-07-22")
        counts = [s["count"] for s in f["steps"]]
        assert counts == sorted(counts, reverse=True)      # mock 은 단계마다 줄어든다
        assert f["steps"][0]["step_rate"] is None          # 첫 단계는 직전이 없음
        assert f["steps"][0]["overall_rate"] == 100.0
        assert all(s["step_rate"] <= 100 for s in f["steps"][1:])
        assert f["bottleneck"]                             # 병목 단계가 지목돼야 한다
    finally:
        store.close()


def test_purchase_funnel_channel_filter_is_subset_of_total(tmp_path):
    store = _seeded(tmp_path)
    try:
        total = purchase_funnel(store, "2026-07-20", "2026-07-22")
        meta = purchase_funnel(store, "2026-07-20", "2026-07-22", channel="meta")
        assert meta["channel"] == "meta"
        assert 0 < meta["steps"][0]["count"] < total["steps"][0]["count"]
    finally:
        store.close()


def test_funnel_by_channel_compares_cvr_per_channel(tmp_path):
    store = _seeded(tmp_path)
    try:
        rows = funnel_by_channel(store, "2026-07-20", "2026-07-22")
        assert rows and rows == sorted(rows, key=lambda x: -x["start"])
        assert all(r["purchases"] <= r["start"] for r in rows)
        assert all(r["label"] for r in rows)
    finally:
        store.close()
