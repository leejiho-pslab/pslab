"""GA4 엔드포인트 계약 테스트 — 프론트가 기대하는 키가 실제로 나오는지."""
from fastapi.testclient import TestClient

import api.main as apimain
from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store

DAYS = [f"2026-07-{d:02d}" for d in range(14, 27)]
SEL = ("2026-07-21", "2026-07-26")


def _client(tmp_path, monkeypatch):
    cfg = load_config()
    store = Store(tmp_path)
    for d in DAYS:
        run_pipeline(d, cfg, store, mode="mock")
    store.close()
    monkeypatch.setattr(apimain._config, "data_dir", tmp_path)
    return TestClient(apimain.app)


def test_ga4_site_endpoint(tmp_path, monkeypatch):
    r = _client(tmp_path, monkeypatch).get(f"/api/ga4/site?from={SEL[0]}&to={SEL[1]}")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["sessions"] > 0
    assert len(body["trend"]) == 6


def test_ga4_channels_defaults_comparison_period(tmp_path, monkeypatch):
    """cmp 파라미터를 안 줘도 직전 동일 길이 기간이 자동으로 잡혀야 한다."""
    r = _client(tmp_path, monkeypatch).get(f"/api/ga4/channels?from={SEL[0]}&to={SEL[1]}")
    assert r.status_code == 200
    body = r.json()
    assert (body["cmp_from"], body["cmp_to"]) == ("2026-07-15", "2026-07-20")
    assert body["channels"] and body["rows"]
    assert any(c["sessions_delta"] is not None for c in body["channels"])


def test_ga4_journey_returns_all_four_analyses(tmp_path, monkeypatch):
    r = _client(tmp_path, monkeypatch).get(f"/api/ga4/journey?from={SEL[0]}&to={SEL[1]}")
    assert r.status_code == 200
    body = r.json()
    assert body["entry_paths"] and body["entry_paths"][0]["pages"]
    assert body["exit_pages"] and "bounce_delta" in body["exit_pages"][0]
    assert body["funnel"]["steps"] and body["funnel"]["bottleneck"]
    assert body["funnel_channels"]


def test_ga4_journey_channel_filter(tmp_path, monkeypatch):
    c = _client(tmp_path, monkeypatch)
    total = c.get(f"/api/ga4/journey?from={SEL[0]}&to={SEL[1]}").json()
    meta = c.get(f"/api/ga4/journey?from={SEL[0]}&to={SEL[1]}&channel=meta").json()
    assert meta["funnel"]["channel"] == "meta"
    assert meta["funnel"]["steps"][0]["count"] < total["funnel"]["steps"][0]["count"]


# ── 카페24 접속통계 엔드포인트 ─────────────────────────────────
def test_shop_analytics_endpoint_returns_funnel_and_keywords(tmp_path, monkeypatch):
    r = _client(tmp_path, monkeypatch).get(f"/api/shop/analytics?from={SEL[0]}&to={SEL[1]}")
    assert r.status_code == 200
    body = r.json()
    assert body["summary"]["visits"] > 0
    assert body["funnel"] and "cart_rate" in body["funnel"][0]
    assert body["bottleneck"]["cart_rate"] is not None
    assert body["keywords"] and body["referrers"] and body["ads"]
    assert body["pages"] and "member" in body
    # 비교기간이 자동으로 잡힌다
    assert (body["cmp_from"], body["cmp_to"]) == ("2026-07-15", "2026-07-20")
