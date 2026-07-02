from cafe24_ops.config import load_config
from cafe24_ops.etl.creative_metrics import (
    creative_fatigue,
    creative_overview,
    creative_trend,
    creatives_ranked,
)
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def _store(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    for d in range(10, 18):
        run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
    return cfg, store


def test_creatives_ranked_by_roas(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        items = creatives_ranked(store, "2026-06-17", top_n=5, sort="roas")
        assert 0 < len(items) <= 5
        roas = [x["roas"] for x in items if x["roas"] is not None]
        assert roas == sorted(roas, reverse=True)
        c = items[0]
        assert c["ctr"] is not None and c["cvr"] is not None and c["name"]
    finally:
        store.close()


def test_creative_fatigue_has_flag(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        items = creative_fatigue(store, "2026-06-17", window=3)
        assert len(items) == 6
        assert all("fatigued" in x and "change_pct" in x for x in items)
    finally:
        store.close()


def test_creative_overview_range(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        o = creative_overview(store, "2026-06-11", "2026-06-17")
        assert o["summary"]["creative_count"] == 6
        assert o["summary"]["impressions"] > 0
        # 채널별 그룹의 소재 합 == 전체 라이브 소재 수
        grouped = sum(len(g["creatives"]) for g in o["by_channel"])
        assert grouped == len(o["creatives"]) == 6
    finally:
        store.close()


def test_creative_trend_single(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        rows = creative_trend(store, "AD-001", "2026-06-15", "2026-06-17")
        assert len(rows) == 3
        assert "roas" in rows[0]
    finally:
        store.close()
