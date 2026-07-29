from datetime import datetime, timezone

import cafe24_ops.pipeline as pipeline_mod
from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def test_pipeline_end_to_end_mock(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        result = run_pipeline("2026-06-17", cfg, store, mode="mock")

        # 모든 소스가 수집을 시도했다.
        assert set(result.per_source) == {"cafe24", "ads", "creative", "keyword",
                                          "ga4_site", "competitor"}
        # 카페24 mock 은 9개 요약 KPI(+차원 팩트)를 생성한다(신규회원가입수 포함).
        assert result.per_source["cafe24"] >= 8
        assert len(result.kpi) == 9
        # facts / kpi 가 저장됐다.
        assert store.count_facts() > 0
        assert "gross_sales" in result.kpi
        # 집계 KPI 가 저장소에서 다시 읽힌다.
        kpi = store.get_kpi("2026-06-17")
        assert kpi["gross_sales"] == result.kpi["gross_sales"]
        assert "2026-06-17" in store.list_dates()
    finally:
        store.close()


def test_yesterday_uses_kst_not_runner_utc_date(monkeypatch):
    """GitHub Actions 러너는 시스템 시계가 UTC — 07:00~08:59 KST(=전날 22:00~23:59 UTC)
    실행 구간에서 UTC 날짜로 계산하면 하루 더 과거로 밀리던 버그의 회귀 테스트.

    2026-07-05T22:48 UTC == 2026-07-06 07:48 KST 이므로 KST 기준 어제는 07-05.
    (UTC 날짜 기준으로 잘못 계산하면 07-04 가 나옴)
    """
    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            fixed = datetime(2026, 7, 5, 22, 48, 0, tzinfo=timezone.utc)
            return fixed.astimezone(tz) if tz else fixed

    monkeypatch.setattr(pipeline_mod, "datetime", FixedDatetime)
    assert pipeline_mod.yesterday() == "2026-07-05"


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
