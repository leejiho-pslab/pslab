"""GA4 사이트 분석 — 매핑/수집기/집계/API 검증."""
from __future__ import annotations

from fastapi.testclient import TestClient

import cafe24_ops.clients.ga4 as ga4_module
from api.main import app
from cafe24_ops.clients.ga4 import ga4_report_to_site_metrics
from cafe24_ops.collectors.ga4_site import Ga4SiteCollector
from cafe24_ops.config import load_config
from cafe24_ops.etl.ga4_site import site_summary, site_trend


def test_ga4_report_to_site_metrics_mapping():
    raw = {"rows": [{"metricValues": [
        {"value": "850"}, {"value": "1020"}, {"value": "3100"}, {"value": "127.4"},
    ]}]}
    out = ga4_report_to_site_metrics(raw)
    assert out == {"site_visitors": 850.0, "site_sessions": 1020.0,
                   "site_page_views": 3100.0, "site_avg_duration": 127.4}
    assert ga4_report_to_site_metrics({"rows": []}) is None
    assert ga4_report_to_site_metrics({}) is None


def test_ga4_site_collector_mock_deterministic():
    cfg = load_config()
    c = Ga4SiteCollector(cfg, mode="mock")
    a = c.collect("2026-06-20")
    b = c.collect("2026-06-20")
    assert a == b                                   # 같은 날짜 = 같은 값
    metrics = {r["metric"] for r in a}
    assert metrics == {"site_visitors", "site_sessions", "site_page_views", "site_avg_duration"}
    assert all(r["source"] == "ga4_site" for r in a)


def test_ga4_site_collector_live_skips_without_creds(monkeypatch):
    monkeypatch.setattr(ga4_module.GA4Client, "from_env", classmethod(lambda cls: None))
    cfg = load_config()
    c = Ga4SiteCollector(cfg, mode="live")
    try:
        c.collect("2026-06-20")
        raise AssertionError("자격증명 없으면 NotImplementedError 로 스킵돼야 함")
    except NotImplementedError:
        pass


class _FakeStore:
    def __init__(self, facts):
        self._facts = facts

    def get_facts(self, date_from, date_to, source=None):
        return [f for f in self._facts if date_from <= f["date"] <= date_to]


def test_site_summary_weights_duration_by_sessions():
    store = _FakeStore([
        {"date": "2026-06-20", "metric": "site_visitors", "value": 100},
        {"date": "2026-06-20", "metric": "site_sessions", "value": 100},
        {"date": "2026-06-20", "metric": "site_page_views", "value": 300},
        {"date": "2026-06-20", "metric": "site_avg_duration", "value": 60},
        {"date": "2026-06-21", "metric": "site_visitors", "value": 300},
        {"date": "2026-06-21", "metric": "site_sessions", "value": 300},
        {"date": "2026-06-21", "metric": "site_page_views", "value": 600},
        {"date": "2026-06-21", "metric": "site_avg_duration", "value": 120},
    ])
    s = site_summary(store, "2026-06-20", "2026-06-21")
    assert s["visitors"] == 400 and s["page_views"] == 900
    # 가중평균: (60*100 + 120*300) / 400 = 105 (단순평균 90 이 아님)
    assert s["avg_session_duration"] == 105.0
    assert s["pages_per_session"] == 2.25

    rows = site_trend(store, "2026-06-20", "2026-06-21")
    assert [r["date"] for r in rows] == ["2026-06-20", "2026-06-21"]
    assert rows[0]["visitors"] == 100


def test_ga4_site_endpoint_smoke():
    c = TestClient(app)
    r = c.get("/api/ga4/site?from=2026-06-20&to=2026-06-21")
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body and "trend" in body
