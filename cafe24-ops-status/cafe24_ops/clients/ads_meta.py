"""Meta(Facebook/Instagram) 광고 — Marketing API Insights 커넥터.

자격증명(META_ACCESS_TOKEN, 계정 ID)이 있을 때만 활성화된다.
HTTP 호출부는 실제 토큰으로 검증 필요(엔드포인트/버전 확인), 응답 → 표준 metric 매핑은
순수 함수(meta_insights_to_facts)로 분리해 단위 테스트로 검증한다.

참고: https://developers.facebook.com/docs/marketing-api/insights
"""
from __future__ import annotations

import os

import httpx

META_API_VERSION = "v21.0"
META_BASE = "https://graph.facebook.com"


def _action_value(items, action_type: str) -> float:
    for it in items or []:
        if it.get("action_type") == action_type:
            try:
                return float(it.get("value", 0) or 0)
            except (TypeError, ValueError):
                return 0.0
    return 0.0


def meta_insights_to_facts(date: str, raw: dict) -> list[dict]:
    """Insights 응답 → 표준 metric 레코드(dims.channel=meta)."""
    rows = (raw or {}).get("data") or []
    if not rows:
        return []
    d = rows[0]
    values = {
        "ad_cost": float(d.get("spend", 0) or 0),
        "impressions": float(d.get("impressions", 0) or 0),
        "clicks": float(d.get("clicks", 0) or 0),
        "conversions": _action_value(d.get("actions"), "purchase"),
        "ad_sales": _action_value(d.get("action_values"), "purchase"),
    }
    return [
        {"date": date, "source": "ads", "metric": k, "value": v, "dims": {"channel": "meta"}}
        for k, v in values.items()
    ]


class MetaAdsClient:
    def __init__(
        self,
        account_id: str,
        access_token: str,
        transport: httpx.BaseTransport | None = None,
        base_url: str = META_BASE,
        version: str = META_API_VERSION,
        timeout: float = 30.0,
    ):
        self.account_id = account_id
        self.access_token = access_token
        self.version = version
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_account(cls, acc: dict, transport: httpx.BaseTransport | None = None) -> "MetaAdsClient":
        return cls(
            account_id=str(acc.get("account_id") or os.environ.get("META_AD_ACCOUNT_ID", "")),
            access_token=os.environ.get("META_ACCESS_TOKEN", ""),
            transport=transport,
        )

    def insights(self, date: str) -> dict:
        path = f"/{self.version}/act_{self.account_id}/insights"
        params = {
            "access_token": self.access_token,
            "level": "account",
            "fields": "spend,impressions,clicks,actions,action_values",
            "time_range[since]": date,
            "time_range[until]": date,
        }
        r = self._http.get(path, params=params)
        r.raise_for_status()
        return r.json()

    def fetch_facts(self, date: str) -> list[dict]:
        return meta_insights_to_facts(date, self.insights(date))

    def close(self) -> None:
        self._http.close()
