from cafe24_ops.alerts import build_alerts, sales_anomaly, top_creative_alert
from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def test_sales_anomaly_detects_drop(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        # 직전 7일 매출을 높게, 당일을 낮게 강제 주입
        for d in range(10, 17):
            store.upsert_kpi(f"2026-06-{d:02d}", {"gross_sales": 1_000_000.0})
        store.upsert_kpi("2026-06-17", {"gross_sales": 300_000.0})  # -70%

        a = sales_anomaly(store, "2026-06-17", drop_pct=30.0)
        assert a is not None and a["type"] == "sales_drop"
        assert a["level"] == "warning"
        # 변화 없으면 None
        store.upsert_kpi("2026-06-17", {"gross_sales": 1_000_000.0})
        assert sales_anomaly(store, "2026-06-17") is None
    finally:
        store.close()


def test_build_alerts_includes_top_creative(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        for d in range(15, 18):
            run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
        assert top_creative_alert(store, "2026-06-17") is not None
        alerts = build_alerts(store, "2026-06-17")
        assert any(a["type"] == "top_creative" for a in alerts)
    finally:
        store.close()
