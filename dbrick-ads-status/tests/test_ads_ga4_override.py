"""AdsCollector 가 GA4 전환 데이터로 conversions 를 대체하는지 검증.

실제 HTTP/자격증명 없이, GA4Client.from_env 를 스텁으로 교체해 순수 로직만 확인한다.
"""
from __future__ import annotations

import cafe24_ops.clients.ga4 as ga4_module
from cafe24_ops.collectors.ads import AdsCollector
from cafe24_ops.config import load_config


class _StubGA4Client:
    def __init__(self, by_channel):
        self._by_channel = by_channel
        self.closed = False

    def daily_channel_conversions(self, date, mapping=None):
        return self._by_channel

    def close(self):
        self.closed = True


def test_ga4_not_configured_leaves_records_untouched(monkeypatch):
    monkeypatch.setattr(ga4_module.GA4Client, "from_env", classmethod(lambda cls: None))
    cfg = load_config()
    collector = AdsCollector(cfg, mode="live")
    records = [{"date": "2026-06-17", "source": "ads", "metric": "conversions",
                "value": 10.0, "dims": {"channel": "meta"}}]
    out = collector._apply_ga4_conversions("2026-06-17", records)
    assert out == records


def test_ga4_configured_overrides_conversions_and_keeps_unmapped(monkeypatch):
    stub = _StubGA4Client({
        "meta": {"conversions": 7.0, "ga4_conversion_value": 210000.0},
        "ga4_unmapped": {"conversions": 1.0, "ga4_conversion_value": 0.0},
    })
    monkeypatch.setattr(ga4_module.GA4Client, "from_env", classmethod(lambda cls: stub))
    cfg = load_config()
    collector = AdsCollector(cfg, mode="live")
    records = [
        {"date": "2026-06-17", "source": "ads", "metric": "ad_cost",
         "value": 100000.0, "dims": {"channel": "meta"}},
        # 광고 플랫폼 자체 보고 conversions(오래되거나 부정확할 수 있음) — GA4 값으로 대체돼야 함
        {"date": "2026-06-17", "source": "ads", "metric": "conversions",
         "value": 999.0, "dims": {"channel": "meta"}},
    ]
    out = collector._apply_ga4_conversions("2026-06-17", records)
    assert stub.closed is True

    by_metric_channel = {(r["metric"], r["dims"]["channel"]): r["value"] for r in out}
    assert by_metric_channel[("ad_cost", "meta")] == 100000.0        # 건드리지 않음
    assert by_metric_channel[("conversions", "meta")] == 7.0         # GA4 값으로 대체
    assert by_metric_channel[("ga4_conversion_value", "meta")] == 210000.0
    assert by_metric_channel[("conversions", "ga4_unmapped")] == 1.0  # 미매핑도 유실 없이 노출
