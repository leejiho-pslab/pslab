from cafe24_ops.config import load_config
from cafe24_ops.etl.ads_metrics import ads_by_channel, ads_summary, ads_trend
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def _store(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    for d in range(15, 18):
        run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
    return cfg, store


def test_ads_by_channel_derives_metrics(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        chans = ads_by_channel(store, "2026-06-17")
        names = {c["channel"] for c in chans}
        assert {"meta", "google", "naver", "kakao"} <= names
        c = chans[0]
        # roas = ad_sales / ad_cost
        assert abs(c["roas"] - round(c["ad_sales"] / c["ad_cost"], 2)) < 0.01
        assert c["ctr"] is not None and c["cpc"] is not None
        # ad_sales 내림차순 정렬
        assert all(chans[i]["ad_sales"] >= chans[i + 1]["ad_sales"] for i in range(len(chans) - 1))
    finally:
        store.close()


def test_ads_summary_share_vs_gross(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        s = ads_summary(store, "2026-06-17")
        gross = store.get_kpi("2026-06-17")["gross_sales"]
        assert s["gross_sales"] == gross
        assert abs(s["ad_share"] - round(s["ad_sales"] / gross * 100, 2)) < 0.01
        assert s["channels"] == 4
    finally:
        store.close()


def test_ads_trend_rows(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        rows = ads_trend(store, "2026-06-15", "2026-06-17")
        assert len(rows) == 3
        assert rows[0]["roas"] is not None
    finally:
        store.close()
