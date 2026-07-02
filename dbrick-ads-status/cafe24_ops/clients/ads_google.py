"""Google Ads — REST searchStream(GAQL) 커넥터.

자격증명(GOOGLE_ADS_ACCESS_TOKEN/DEVELOPER_TOKEN, customer id)이 있을 때만 활성화.
cost_micros 는 1e6 으로 나눠 통화로 환산한다. HTTP는 실 키로 검증 필요, 매핑은 단위검증.

참고: https://developers.google.com/google-ads/api/rest/overview
"""
from __future__ import annotations

import os

import httpx

GA_BASE = "https://googleads.googleapis.com"
GA_VERSION = "v17"


def google_to_facts(date: str, raw) -> list[dict]:
    """searchStream 응답(배치 배열) → 표준 metric 레코드(dims.channel=google)."""
    batches = raw if isinstance(raw, list) else [raw]
    cost = impr = clicks = conv = val = 0.0
    for batch in batches:
        for res in (batch or {}).get("results", []) or []:
            m = res.get("metrics", {}) or {}
            cost += float(m.get("costMicros", 0) or 0) / 1e6
            impr += float(m.get("impressions", 0) or 0)
            clicks += float(m.get("clicks", 0) or 0)
            conv += float(m.get("conversions", 0) or 0)
            val += float(m.get("conversionsValue", 0) or 0)
    if not (cost or impr or clicks or val):
        return []
    values = {"ad_cost": cost, "impressions": impr, "clicks": clicks,
              "conversions": conv, "ad_sales": val}
    return [
        {"date": date, "source": "ads", "metric": k, "value": v, "dims": {"channel": "google"}}
        for k, v in values.items()
    ]


class GoogleAdsClient:
    def __init__(
        self,
        customer_id: str,
        access_token: str,
        developer_token: str,
        login_customer_id: str = "",
        transport: httpx.BaseTransport | None = None,
        base_url: str = GA_BASE,
        version: str = GA_VERSION,
        timeout: float = 30.0,
    ):
        self.customer_id = customer_id
        self.access_token = access_token
        self.developer_token = developer_token
        self.login_customer_id = login_customer_id
        self.version = version
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_account(cls, acc: dict, transport: httpx.BaseTransport | None = None) -> "GoogleAdsClient":
        return cls(
            customer_id=str(acc.get("account_id") or os.environ.get("GOOGLE_ADS_CUSTOMER_ID", "")),
            access_token=os.environ.get("GOOGLE_ADS_ACCESS_TOKEN", ""),
            developer_token=os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", ""),
            login_customer_id=os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", ""),
            transport=transport,
        )

    def search(self, date: str) -> list:
        query = (
            "SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, "
            "metrics.conversions, metrics.conversions_value "
            f"FROM customer WHERE segments.date = '{date}'"
        )
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "developer-token": self.developer_token,
            "Content-Type": "application/json",
        }
        if self.login_customer_id:
            headers["login-customer-id"] = self.login_customer_id
        r = self._http.post(
            f"/{self.version}/customers/{self.customer_id}/googleAds:searchStream",
            json={"query": query},
            headers=headers,
        )
        r.raise_for_status()
        return r.json()

    def fetch_facts(self, date: str) -> list[dict]:
        return google_to_facts(date, self.search(date))

    def close(self) -> None:
        self._http.close()
