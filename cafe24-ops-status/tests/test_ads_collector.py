"""AdsCollector 채널 간 장애 격리 — 한 채널 실패가 나머지 채널을 무너뜨리지 않아야 한다."""
import pytest

from cafe24_ops.collectors.ads import AdsCollector
from cafe24_ops.config import load_config


class _StubClient:
    def __init__(self, facts=None, exc=None):
        self._facts, self._exc = facts or [], exc

    def fetch_facts(self, date):
        if self._exc:
            raise self._exc
        return self._facts

    def close(self):
        pass


def _only_naver_kakao_creds(monkeypatch):
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("META_APP_ID", raising=False)
    monkeypatch.delenv("GOOGLE_ADS_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("NAVER_SA_API_KEY", "k")
    monkeypatch.setenv("KAKAO_ACCESS_TOKEN", "t")
    # meta 는 DB 토큰 경로도 있으니 그것도 차단
    monkeypatch.setattr(AdsCollector, "_meta_db_token", lambda self: None)


def test_ads_one_channel_failure_keeps_other_channels(monkeypatch):
    _only_naver_kakao_creds(monkeypatch)

    from cafe24_ops.clients import ads_kakao, ads_naver

    monkeypatch.setattr(
        ads_naver.NaverSearchAdClient, "from_account",
        classmethod(lambda cls, acc: _StubClient(exc=RuntimeError("naver down"))))
    kakao_fact = {"date": "2026-06-17", "source": "ads", "metric": "ad_cost",
                  "value": 100.0, "dims": {"channel": "kakao"}}
    monkeypatch.setattr(
        ads_kakao.KakaoMomentClient, "from_account",
        classmethod(lambda cls, acc: _StubClient(facts=[kakao_fact])))

    col = AdsCollector(load_config(), mode="live")
    records = col.collect("2026-06-17")
    assert records == [kakao_fact]                       # 정상 채널은 살아남는다
    assert "naver down" in col.partial_errors["naver"]   # 실패 채널은 기록된다


def test_ads_all_attempted_channels_failed_returns_empty_with_errors(monkeypatch):
    """시도한 채널이 전부 실패해도 예외 대신 빈 결과 + partial_errors (파이프라인이 경고 승격)."""
    _only_naver_kakao_creds(monkeypatch)

    from cafe24_ops.clients import ads_kakao, ads_naver

    monkeypatch.setattr(
        ads_naver.NaverSearchAdClient, "from_account",
        classmethod(lambda cls, acc: _StubClient(exc=RuntimeError("naver down"))))
    monkeypatch.setattr(
        ads_kakao.KakaoMomentClient, "from_account",
        classmethod(lambda cls, acc: _StubClient(exc=RuntimeError("kakao down"))))

    col = AdsCollector(load_config(), mode="live")
    assert col.collect("2026-06-17") == []
    assert set(col.partial_errors) == {"naver", "kakao"}


def test_ads_no_credentials_still_raises_not_implemented(monkeypatch):
    """자격증명이 전혀 없으면 기존과 동일하게 NotImplementedError(파이프라인이 스킵 처리)."""
    for var in ("META_ACCESS_TOKEN", "META_APP_ID", "GOOGLE_ADS_ACCESS_TOKEN",
                "NAVER_SA_API_KEY", "KAKAO_ACCESS_TOKEN"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setattr(AdsCollector, "_meta_db_token", lambda self: None)

    col = AdsCollector(load_config(), mode="live")
    with pytest.raises(NotImplementedError):
        col.collect("2026-06-17")
