from cafe24_ops.config import load_config
from cafe24_ops.etl.compare import period_comparison, summary_cards_range
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def test_summary_cards_range_matches_period_table(tmp_path):
    """상단 요약 카드(기간 합계)가 '핵심 지표 기간 비교' 표의 최근7일 값과 일치해야 한다."""
    cfg = load_config()
    store = Store(tmp_path)
    try:
        for d in range(4, 18):
            run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
        cards = {c["key"]: c["value"] for c in
                 summary_cards_range(store, "2026-06-11", "2026-06-17", cfg.metrics)}
        rows = {r["key"]: r for r in period_comparison(store, "2026-06-17", cfg.metrics)}
        # 합산형·파생형 모두 같은 기간이면 같은 값
        assert cards["gross_sales"] == rows["gross_sales"]["values"]["recent_7d"]
        assert cards["ad_cost_ratio"] == rows["ad_cost_ratio"]["values"]["recent_7d"]
        # 단일일이면 그 날 값
        one = {c["key"]: c["value"] for c in
               summary_cards_range(store, "2026-06-17", "2026-06-17", cfg.metrics)}
        daily = {d["metric"]: d["value"] for d in store.get_daily("2026-06-17", "2026-06-17")}
        assert one["gross_sales"] == daily["gross_sales"]
    finally:
        store.close()


def test_period_comparison_recent7d_sums(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        # 14일치 mock 적재 (recent_7d / prev_7d 모두 채워짐)
        for d in range(4, 18):
            run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")

        rows = {r["key"]: r for r in period_comparison(store, "2026-06-17", cfg.metrics)}

        # 매출(합산형): 최근7일 = 2026-06-11~17 일별 매출 합
        daily = {d["date"]: d["value"] for d in store.get_daily("2026-06-11", "2026-06-17")
                 if d["metric"] == "gross_sales"}
        assert rows["gross_sales"]["values"]["recent_7d"] == sum(daily.values())

        # 증감률(최근7일 vs 직전7일) 계산됨
        assert rows["gross_sales"]["delta_recent_vs_prev"] is not None

        # 파생 지표(객단가) = 매출합/주문수합
        g = rows["gross_sales"]["values"]["recent_7d"]
        o = rows["order_count"]["values"]["recent_7d"]
        assert abs(rows["aov"]["values"]["recent_7d"] - g / o) < 1e-6
    finally:
        store.close()
