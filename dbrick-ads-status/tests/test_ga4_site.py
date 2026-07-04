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
    sources = {r["source"] for r in a}
    assert sources == {"ga4_site", "ga4_channel", "ga4_page"}
    site_metrics = {r["metric"] for r in a if r["source"] == "ga4_site"}
    assert site_metrics == {"site_visitors", "site_sessions", "site_page_views",
                            "site_avg_duration", "site_new", "site_returning"}
    # 매체별/페이지별 상세도 dims 를 달고 나온다
    assert any(r["source"] == "ga4_channel" and "source_medium" in r["dims"] for r in a)
    assert any(r["source"] == "ga4_page" and "page" in r["dims"] for r in a)


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
        # 각 fact 에 source 기본값 ga4_site, dims 기본값 {} 부여
        self._facts = [{"source": "ga4_site", "dims": {}, **f} for f in facts]

    def get_facts(self, date_from, date_to, source=None):
        return [
            f for f in self._facts
            if date_from <= f["date"] <= date_to and (source is None or f["source"] == source)
        ]


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


def test_source_medium_breakdown_sorts_and_deltas():
    from cafe24_ops.etl.ga4_site import source_medium_breakdown
    facts = [
        # 선택기간
        {"date": "2026-06-27", "source": "ga4_channel", "metric": "sessions", "value": 889, "dims": {"source_medium": "meta / cpc"}},
        {"date": "2026-06-27", "source": "ga4_channel", "metric": "conversions", "value": 20, "dims": {"source_medium": "meta / cpc"}},
        {"date": "2026-06-27", "source": "ga4_channel", "metric": "sessions", "value": 144, "dims": {"source_medium": "naver_sa / cpc"}},
        # 비교기간
        {"date": "2026-06-20", "source": "ga4_channel", "metric": "sessions", "value": 700, "dims": {"source_medium": "meta / cpc"}},
    ]
    store = _FakeStore(facts)
    rows = source_medium_breakdown(store, "2026-06-27", "2026-06-27", "2026-06-20", "2026-06-20")
    assert rows[0]["source_medium"] == "meta / cpc"          # 세션 많은 순
    assert rows[0]["sessions"] == 889 and rows[0]["conversions"] == 20
    assert rows[0]["sessions_delta"] == 27.0                  # (889-700)/700*100
    assert rows[1]["source_medium"] == "naver_sa / cpc"


def test_top_pages_sorts_and_limits():
    from cafe24_ops.etl.ga4_site import top_pages
    facts = [
        {"date": "2026-06-27", "source": "ga4_page", "metric": "views", "value": 1200, "dims": {"page": "무료 상담 | 디브릭"}},
        {"date": "2026-06-27", "source": "ga4_page", "metric": "views", "value": 532, "dims": {"page": "디브릭 - 포트폴리오"}},
        {"date": "2026-06-27", "source": "ga4_page", "metric": "views", "value": 250, "dims": {"page": "30평대 인테리어"}},
    ]
    store = _FakeStore(facts)
    rows = top_pages(store, "2026-06-27", "2026-06-27", limit=2)
    assert len(rows) == 2
    assert rows[0] == {"page": "무료 상담 | 디브릭", "views": 1200.0}


def test_ga4_channels_and_pages_endpoints_smoke():
    c = TestClient(app)
    assert c.get("/api/ga4/channels?from=2026-06-20&to=2026-06-21").status_code == 200
    assert c.get("/api/ga4/pages?from=2026-06-20&to=2026-06-21").status_code == 200
