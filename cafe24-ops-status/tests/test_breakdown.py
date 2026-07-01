from cafe24_ops.config import load_config
from cafe24_ops.etl.breakdown import (
    best_products,
    category_breakdown,
    crm_counts,
    device_breakdown,
    new_returning_trend,
    visitor_detail,
)
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def _store_with_data(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    for d in range(15, 18):
        run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
    return cfg, store


def test_device_split_sums_to_gross(tmp_path):
    cfg, store = _store_with_data(tmp_path)
    try:
        dev = {x["key"]: x["value"] for x in device_breakdown(store, "2026-06-17")}
        assert set(dev) == {"mobile", "pc"}
        gross = store.get_kpi("2026-06-17")["gross_sales"]
        assert abs(dev["mobile"] + dev["pc"] - gross) < 1.0
    finally:
        store.close()


def test_category_and_best_ranked(tmp_path):
    cfg, store = _store_with_data(tmp_path)
    try:
        cats = category_breakdown(store, "2026-06-17")
        assert len(cats) == len(cfg.metrics.daily_groups[6]["metrics"])  # 카테고리 매출 그룹
        # 내림차순 정렬
        assert all(cats[i]["value"] >= cats[i + 1]["value"] for i in range(len(cats) - 1))

        best = best_products(store, "2026-06-17", top_n=5)
        assert len(best) == 5
        assert all(best[i]["value"] >= best[i + 1]["value"] for i in range(len(best) - 1))
    finally:
        store.close()


def test_crm_and_new_returning(tmp_path):
    cfg, store = _store_with_data(tmp_path)
    try:
        crm = crm_counts(store, "2026-06-17")
        # 발송 채널 4종은 반드시 포함(신규가입수는 mock 데이터 유무에 따라 선택적으로 병합)
        assert {"sms", "alimtalk", "kakao", "reviews"} <= set(crm)

        trend = new_returning_trend(store, "2026-06-15", "2026-06-17")
        assert len(trend) == 3
        assert {"new", "returning"} <= set(trend[0])
    finally:
        store.close()


def test_visitor_detail(tmp_path):
    cfg, store = _store_with_data(tmp_path)
    try:
        v = visitor_detail(store, "2026-06-17")
        # mock 은 방문자/신규·재방문/가입수를 모두 생성 → 상세 지표가 채워진다
        assert v["visitors"] and v["visitors"] > 0
        assert v["new"] is not None and v["returning"] is not None
        assert abs((v["new"] + v["returning"]) - v["visitors"]) < 1e-6
        assert 0 <= v["return_rate"] <= 100
        assert v["signup_rate"] is not None
    finally:
        store.close()
