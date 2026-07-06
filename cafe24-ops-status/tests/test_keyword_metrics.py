from cafe24_ops.config import load_config
from cafe24_ops.etl.keyword_metrics import keyword_report_range
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def _store(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    for d in range(10, 18):
        run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
    return cfg, store


def test_keyword_report_range_powerlink(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        r = keyword_report_range(store, "2026-06-11", "2026-06-17", channel="naver_powerlink")
        assert r["channel"] == "naver_powerlink"
        assert r["summary"]["keyword_count"] == 3   # MOCK_KEYWORDS 중 naver_powerlink 3개
        assert all(k["ctr"] is not None for k in r["keywords"])
        costs = [k["ad_cost"] for k in r["keywords"]]
        assert costs == sorted(costs, reverse=True)  # 기본 정렬 = ad_cost desc
    finally:
        store.close()


def test_keyword_report_range_place(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        r = keyword_report_range(store, "2026-06-11", "2026-06-17", channel="naver_place")
        assert r["summary"]["keyword_count"] == 1
    finally:
        store.close()


def test_keyword_report_range_sort_by_clicks(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        r = keyword_report_range(store, "2026-06-11", "2026-06-17", channel="naver_powerlink", sort="clicks")
        clicks = [k["clicks"] for k in r["keywords"]]
        assert clicks == sorted(clicks, reverse=True)
    finally:
        store.close()


def test_keyword_report_range_empty_channel(tmp_path):
    cfg, store = _store(tmp_path)
    try:
        r = keyword_report_range(store, "2026-06-11", "2026-06-17", channel="naver_other")
        assert r["summary"]["keyword_count"] == 0
        assert r["keywords"] == []
    finally:
        store.close()
