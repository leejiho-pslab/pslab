from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


class _OkCollector:
    source = "cafe24"

    def collect(self, date):
        return [{"date": date, "source": "cafe24", "metric": "gross_sales", "value": 1000.0}]


class _NotYetCollector:
    source = "ads"

    def collect(self, date):
        raise NotImplementedError("Phase 2에서 구현됩니다.")


def test_live_skips_unimplemented_sources(tmp_path):
    """live 모드에서 미구현 소스(NotImplementedError)는 건너뛰고 나머지는 정상 처리."""
    cfg = load_config()
    store = Store(tmp_path)
    try:
        result = run_pipeline(
            "2026-06-17", cfg, store, mode="live",
            collectors=[_OkCollector(), _NotYetCollector()],
        )
        assert result.per_source["ads"] == 0          # 건너뜀
        assert result.per_source["cafe24"] == 1        # 정상
        assert result.kpi["gross_sales"] == 1000.0     # 파이프라인 완주
    finally:
        store.close()
