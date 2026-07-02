from cafe24_ops.config import load_config
from cafe24_ops.etl.aggregate import aggregate_daily
from cafe24_ops.models import Fact


def test_ads_source_facts_roll_up_into_kpi():
    """ads 소스는 채널별(dims) facts 로 저장되므로, 합산해서 kpi_daily 후보에 넣어야 한다.

    회귀 방지: 과거엔 aggregate_daily 가 cafe24 소스만 봐서 ad_cost/ad_sales/
    ad_cost_ratio 가 항상 비어(대시보드 "—") 있었다.
    """
    cfg = load_config()
    facts = [
        Fact(date="2026-06-29", source="cafe24", metric="gross_sales", value=1_000_000, dims={}),
        Fact(date="2026-06-29", source="ads", metric="ad_cost", value=100_000, dims={"channel": "meta"}),
        Fact(date="2026-06-29", source="ads", metric="ad_cost", value=50_000, dims={"channel": "naver"}),
        Fact(date="2026-06-29", source="ads", metric="ad_sales", value=200_000, dims={"channel": "meta"}),
        Fact(date="2026-06-29", source="ads", metric="ad_sales", value=90_000, dims={"channel": "naver"}),
        # dims 없는 impressions 는 wanted 에 없으니 무시돼도 무방(여기선 제공 안 함)
    ]
    kpi = aggregate_daily("2026-06-29", facts, cfg.metrics)
    assert kpi["ad_cost"] == 150_000
    assert kpi["ad_sales"] == 290_000
    assert kpi["ad_cost_ratio"] == round(150_000 / 1_000_000 * 100, 2)


def test_ads_facts_absent_when_no_ads_collected():
    cfg = load_config()
    facts = [
        Fact(date="2026-06-29", source="cafe24", metric="gross_sales", value=1_000_000, dims={}),
    ]
    kpi = aggregate_daily("2026-06-29", facts, cfg.metrics)
    assert "ad_cost" not in kpi
    assert "ad_cost_ratio" not in kpi
