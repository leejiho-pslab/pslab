from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def test_pipeline_end_to_end_mock(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        result = run_pipeline("2026-06-17", cfg, store, mode="mock")

        # 모든 소스가 수집을 시도했다.
        assert set(result.per_source) == {"cafe24", "ads", "creative", "competitor"}
        # 카페24 mock 은 8개 요약 KPI(+차원 팩트)를 생성한다.
        assert result.per_source["cafe24"] >= 8
        assert len(result.kpi) == 8
        # facts / kpi 가 저장됐다.
        assert store.count_facts() > 0
        assert "gross_sales" in result.kpi
        # 집계 KPI 가 저장소에서 다시 읽힌다.
        kpi = store.get_kpi("2026-06-17")
        assert kpi["gross_sales"] == result.kpi["gross_sales"]
        assert "2026-06-17" in store.list_dates()
    finally:
        store.close()


def test_pipeline_is_deterministic(tmp_path):
    cfg = load_config()
    s1 = Store(tmp_path / "a")
    s2 = Store(tmp_path / "b")
    try:
        r1 = run_pipeline("2026-06-10", cfg, s1, mode="mock")
        r2 = run_pipeline("2026-06-10", cfg, s2, mode="mock")
        assert r1.kpi == r2.kpi  # 같은 날짜 → 같은 mock 값
    finally:
        s1.close()
        s2.close()
