from cafe24_ops.config import load_config
from cafe24_ops.etl.competitor_metrics import competitor_snapshot, competitor_trend
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def _store(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    for d in range(15, 18):
        run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
    return cfg, store


def test_competitor_snapshot(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        comps = competitor_snapshot(store, "2026-06-17")
        # sources.yaml 의 경쟁사 수와 일치
        assert len(comps) == len(cfg.sources.competitors)
        c = comps[0]
        assert "active_promotions" in c and "new_reviews" in c and "avg_rating" in c
        assert len(c["best_products"]) == 3
    finally:
        store.close()


def test_competitor_trend(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        rows = competitor_trend(store, "2026-06-15", "2026-06-17")
        assert len(rows) == 3
        assert "new_reviews" in rows[0] and "active_promotions" in rows[0]
    finally:
        store.close()
