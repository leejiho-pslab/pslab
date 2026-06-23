from cafe24_ops.config import load_config
from cafe24_ops.etl.compare import period_comparison
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


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
