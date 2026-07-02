from pathlib import Path

from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


class _BoomCollector:
    source = "ads"

    def collect(self, date):
        raise RuntimeError("token expired")


class _OkCollector:
    source = "cafe24"

    def collect(self, date):
        return [{"date": date, "source": "cafe24", "metric": "gross_sales", "value": 1000.0}]


def test_one_collector_failure_does_not_abort_others(tmp_path: Path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        result = run_pipeline("2026-06-23", cfg, store, mode="live",
                              collectors=[_BoomCollector(), _OkCollector()])
        # 실패 소스는 errors 에 기록, 정상 소스는 수집됨
        assert "ads" in result.errors
        assert result.per_source["cafe24"] == 1
        assert store.get_kpi("2026-06-23").get("gross_sales") == 1000.0
    finally:
        store.close()
