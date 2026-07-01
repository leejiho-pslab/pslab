from cafe24_ops.alerts import (
    build_alerts,
    build_commentary,
    build_digest,
    sales_anomaly,
    top_creative_alert,
)
from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def test_build_commentary_sections(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        # 15일치 mock → 전일/전주/평균 비교와 광고 섹션이 채워진다
        for d in range(10, 25):
            run_pipeline(f"2026-06-{d:02d}", cfg, store, mode="mock")
        c = build_commentary(store, "2026-06-24")
        assert c["headline"]                       # 임원 요약 존재
        # 핵심지표에 매출/전환율 라인 포함, 전일·전주 비교 문구 포함
        joined = " ".join(c["core"])
        assert "매출" in joined and "전일" in joined and "전주" in joined
        assert c["movers"]                          # 급등락 또는 '특이 없음' 문구
        # 광고 섹션: 광고비/ROAS 라인
        ads = " ".join(c["ads"])
        assert "광고비" in ads and "ROAS" in ads and "CTR" in ads
        # 데이터 없는 날짜는 빈 구조 반환(에러 없이)
        empty = build_commentary(store, "2026-01-01")
        assert empty["core"] == [] and empty["ads"] == []
    finally:
        store.close()


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


def test_build_digest_summarizes_day(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        run_pipeline("2026-06-17", cfg, store, mode="mock")
        lines = build_digest(store, "2026-06-17")
        text = "\n".join(lines)
        assert any("매출" in ln for ln in lines)        # 핵심 KPI 라인
        assert any("카테고리" in ln for ln in lines)     # 카테고리 요약
        assert any("광고비" in ln for ln in lines)       # 광고 요약
        # 데이터 없는 날은 빈 요약
        assert build_digest(store, "2099-01-01") == []
    finally:
        store.close()


def test_collection_health_alert(tmp_path):
    from cafe24_ops.alerts import collection_health_alert
    store = Store(tmp_path)
    try:
        # 오류 없음 → None
        store.set_kv("collect_status:2026-06-20", '{"per_source": {"cafe24": 10}, "errors": {}}')
        assert collection_health_alert(store, "2026-06-20") is None
        # 오류 있음 → 경고
        store.set_kv("collect_status:2026-06-21",
                     '{"per_source": {"cafe24": 10}, "errors": {"ads": "HTTPStatusError: 401"}}')
        a = collection_health_alert(store, "2026-06-21")
        assert a is not None and a["type"] == "collect_error" and "ads" in a["message"]
        # 상태 없음 → None
        assert collection_health_alert(store, "2099-01-01") is None
    finally:
        store.close()
