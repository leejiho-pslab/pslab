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


class _PartialAdsCollector:
    """meta 채널만 실패하고 naver 채널은 수집된 상황을 흉내낸다."""
    source = "ads"
    partial_errors: dict = {}

    def collect(self, date):
        self.partial_errors = {"meta": "HTTPStatusError: 500"}
        return [{"date": date, "source": "ads", "metric": "ad_cost", "value": 500.0,
                 "dims": {"channel": "naver"}}]


def test_partial_channel_failure_is_promoted_to_errors(tmp_path: Path):
    """소스 내부의 채널 단위 실패가 result.errors 로 승격돼 수집경고에 잡혀야 한다."""
    cfg = load_config()
    store = Store(tmp_path)
    try:
        result = run_pipeline("2026-06-23", cfg, store, mode="live",
                              collectors=[_PartialAdsCollector()])
        assert result.errors.get("ads/meta") == "HTTPStatusError: 500"
        assert result.per_source["ads"] == 1  # 정상 채널 데이터는 수집됨
    finally:
        store.close()


def test_partial_failure_preserves_existing_data_of_failed_channel(tmp_path: Path):
    """부분 실패 소스는 delete 없이 upsert만 — 실패 채널의 기존 데이터가 살아남아야 한다."""
    from cafe24_ops.models import Fact

    cfg = load_config()
    store = Store(tmp_path)
    try:
        # 이전 수집에서 meta 채널 데이터가 정상 적재돼 있었다고 가정
        store.upsert_facts([Fact(date="2026-06-23", source="ads", metric="ad_cost",
                                 value=999.0, dims={"channel": "meta"})])
        # 재수집: meta 는 실패(부분 실패), naver 만 성공
        run_pipeline("2026-06-23", cfg, store, mode="live",
                     collectors=[_PartialAdsCollector()])
        by_channel = {f["dims"].get("channel"): f["value"]
                      for f in store.get_facts("2026-06-23", "2026-06-23", source="ads")
                      if f["metric"] == "ad_cost"}
        assert by_channel.get("meta") == 999.0   # 실패 채널의 기존 데이터 보존
        assert by_channel.get("naver") == 500.0  # 성공 채널은 갱신
    finally:
        store.close()


def test_full_success_still_deletes_stale_rows(tmp_path: Path):
    """부분 실패가 없으면 기존처럼 delete+reinsert 로 낡은 차원 행을 정리해야 한다."""
    from cafe24_ops.models import Fact

    class _FullOkAds:
        source = "ads"
        partial_errors: dict = {}

        def collect(self, date):
            self.partial_errors = {}
            return [{"date": date, "source": "ads", "metric": "ad_cost", "value": 500.0,
                     "dims": {"channel": "naver"}}]

    cfg = load_config()
    store = Store(tmp_path)
    try:
        store.upsert_facts([Fact(date="2026-06-23", source="ads", metric="ad_cost",
                                 value=999.0, dims={"channel": "stale_channel"})])
        run_pipeline("2026-06-23", cfg, store, mode="live", collectors=[_FullOkAds()])
        channels = {f["dims"].get("channel")
                    for f in store.get_facts("2026-06-23", "2026-06-23", source="ads")}
        assert channels == {"naver"}  # 낡은 채널 행은 제거됨
    finally:
        store.close()
