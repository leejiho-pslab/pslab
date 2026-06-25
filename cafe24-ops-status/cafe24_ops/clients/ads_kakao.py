"""카카오모먼트(Kakao Moment) — 무료 API 커넥터.

인증: Bearer 액세스 토큰 + adAccountId 헤더. 일자 리포트 메트릭을 표준 매핑한다.
HTTP는 실 토큰으로 검증 필요, 매핑은 단위 테스트로 검증한다.

참고: https://developers.kakao.com/docs/latest/ko/kakaomoment/common
"""
from __future__ import annotations

import os

import httpx

KAKAO_MOMENT_BASE = "https://apis.moment.kakao.com"


def kakao_to_facts(date: str, raw: dict) -> list[dict]:
    """카카오모먼트 리포트 응답 → 표준 metric 레코드(dims.channel=kakao)."""
    rows = (raw or {}).get("data") or []
    if not rows:
        return []
    imp = clk = cost = conv = val = 0.0
    for row in rows:
        m = row.get("metrics", row) or {}
        imp += float(m.get("imp", 0) or 0)
        clk += float(m.get("click", 0) or 0)
        cost += float(m.get("cost", 0) or 0)
        conv += float(m.get("conv_purchase", m.get("conv", 0)) or 0)
        val += float(m.get("conv_purchase_price", m.get("convAmount", 0)) or 0)
    values = {"ad_cost": cost, "impressions": imp, "clicks": clk,
              "conversions": conv, "ad_sales": val}
    return [
        {"date": date, "source": "ads", "metric": k, "value": v, "dims": {"channel": "kakao"}}
        for k, v in values.items()
    ]


class KakaoMomentClient:
    def __init__(
        self,
        access_token: str,
        ad_account_id: str,
        transport: httpx.BaseTransport | None = None,
        base_url: str = KAKAO_MOMENT_BASE,
        timeout: float = 30.0,
    ):
        self.access_token = access_token
        self.ad_account_id = ad_account_id
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_account(cls, acc: dict, transport: httpx.BaseTransport | None = None) -> "KakaoMomentClient":
        return cls(
            access_token=os.environ.get("KAKAO_ACCESS_TOKEN", ""),
            ad_account_id=str(acc.get("account_id") or os.environ.get("KAKAO_AD_ACCOUNT_ID", "")),
            transport=transport,
        )

    def report(self, date: str) -> dict:
        r = self._http.get(
            "/openapi/v4/adAccounts/report",
            params={"start": date, "end": date, "metricsGroup": "BASIC,CONVERSION"},
            headers={
                "Authorization": f"Bearer {self.access_token}",
                "adAccountId": str(self.ad_account_id),
            },
        )
        r.raise_for_status()
        return r.json()

    def fetch_facts(self, date: str) -> list[dict]:
        return kakao_to_facts(date, self.report(date))

    def close(self) -> None:
        self._http.close()
