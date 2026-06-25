from cafe24_ops.config import load_config


def test_metrics_config_loads_defaults():
    cfg = load_config()
    m = cfg.metrics
    # 기존 keek 대시보드와 동일한 요약 KPI 키가 정의돼 있어야 한다.
    assert "gross_sales" in m.summary_keys
    assert "ad_cost_ratio" in m.summary_keys
    assert len(m.summary_cards) == 6
    assert m.collection.granularity == "daily"
    # 라벨 매핑
    assert m.label_for("gross_sales") == "매출"


def test_sources_config_loads():
    cfg = load_config()
    assert cfg.sources.shop.get("platform") == "cafe24"
    channels = {a["channel"] for a in cfg.sources.ads}
    assert {"meta", "google", "naver", "kakao"} <= channels
