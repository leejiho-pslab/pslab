"""네이버 검색광고(SearchAd) — 무료 API 커넥터.

인증: HMAC-SHA256 서명(X-API-KEY/X-Customer/X-Timestamp/X-Signature).
계정 전체 통계는 캠페인 id 목록을 받아 /stats 로 집계한다.
HTTP는 실 키로 검증 필요, 서명/매핑은 단위 테스트로 검증한다.

참고: https://naver.github.io/searchad-apidoc/
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os

import httpx

NAVER_SA_BASE = "https://api.searchad.naver.com"

# 캠페인 유형(campaignTp) → 채널. 파워링크/플레이스는 광고 탭에서 성과를 따로 봐야 하는
# 대표 상품이라 분리하고, 그 외 유형(쇼핑/브랜드검색/파워컨텐츠 등)은 광고비가 조용히
# 사라지지 않도록 "naver_other"로 묶어 그대로 노출한다.
CAMPAIGN_TYPE_CHANNEL = {
    "WEB_SITE": "naver_powerlink",
    "PLACE": "naver_place",
}
DEFAULT_CHANNEL = "naver_other"


def sign(secret_key: str, timestamp: str, method: str, path: str) -> str:
    message = f"{timestamp}.{method}.{path}"
    digest = hmac.new(secret_key.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def naver_sa_to_facts(date: str, raw: dict, channel: str = "naver") -> list[dict]:
    """SA /stats 응답 → 표준 metric 레코드(dims.channel=channel).

    channel 기본값 "naver"는 단일채널 하위호환용. fetch_facts는 campaignTp 기준
    파워링크/플레이스/기타로 분리한 채널명을 넘긴다.
    """
    rows = (raw or {}).get("data") or []
    if not rows:
        return []
    imp = clk = cost = conv = val = 0.0
    for d in rows:
        imp += float(d.get("impCnt", 0) or 0)
        clk += float(d.get("clkCnt", 0) or 0)
        cost += float(d.get("salesAmt", 0) or 0)   # SA salesAmt = 광고비(지출액)
        conv += float(d.get("ccnt", 0) or 0)
        val += float(d.get("convAmt", 0) or 0)
    values = {"ad_cost": cost, "impressions": imp, "clicks": clk,
              "conversions": conv, "ad_sales": val}
    return [
        {"date": date, "source": "ads", "metric": k, "value": v, "dims": {"channel": channel}}
        for k, v in values.items()
    ]


class NaverSearchAdClient:
    def __init__(
        self,
        api_key: str,
        secret_key: str,
        customer_id: str,
        timestamp_fn=None,
        transport: httpx.BaseTransport | None = None,
        base_url: str = NAVER_SA_BASE,
        timeout: float = 30.0,
    ):
        self.api_key = api_key
        self.secret_key = secret_key
        self.customer_id = customer_id
        self._ts = timestamp_fn  # 테스트 주입용
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_account(cls, acc: dict, transport: httpx.BaseTransport | None = None) -> "NaverSearchAdClient":
        return cls(
            api_key=os.environ.get("NAVER_SA_API_KEY", ""),
            secret_key=os.environ.get("NAVER_SA_SECRET_KEY", ""),
            customer_id=str(acc.get("account_id") or os.environ.get("NAVER_SA_CUSTOMER_ID", "")),
            transport=transport,
        )

    def _headers(self, method: str, path: str) -> dict:
        import time

        ts = self._ts() if self._ts else str(int(time.time() * 1000))
        return {
            "X-Timestamp": ts,
            "X-API-KEY": self.api_key,
            "X-Customer": str(self.customer_id),
            "X-Signature": sign(self.secret_key, ts, method, path),
        }

    def _get(self, path: str, params: dict) -> dict:
        r = self._http.get(path, params=params, headers=self._headers("GET", path))
        r.raise_for_status()
        return r.json()

    def list_campaigns(self) -> list[dict]:
        """전체 캠페인의 id + 유형(campaignTp). 파워링크/플레이스 분리 집계에 쓰인다."""
        data = self._get("/ncc/campaigns", {})
        items = data if isinstance(data, list) else data.get("data", [])
        return [
            {"id": c.get("nccCampaignId"), "type": c.get("campaignTp")}
            for c in items if c.get("nccCampaignId")
        ]

    def stats(self, ids: list[str], date: str) -> dict:
        # ids 는 배열(반복 파라미터)로 전송해야 함 — 콤마 결합은 '잘못된 파라미터 형식' 오류.
        params = {
            "ids": list(ids),
            "fields": json.dumps(["impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt"]),
            "timeRange": json.dumps({"since": date, "until": date}),
        }
        return self._get("/stats", params)

    def fetch_facts(self, date: str) -> list[dict]:
        campaigns = self.list_campaigns()
        if not campaigns:
            return []
        # campaignTp 기준으로 캠페인 id 를 채널별(파워링크/플레이스/기타)로 나눠
        # /stats 를 채널별로 집계한다 — 합쳐버리면 두 상품의 성과를 구분할 수 없다.
        ids_by_channel: dict[str, list[str]] = {}
        for c in campaigns:
            channel = CAMPAIGN_TYPE_CHANNEL.get(c["type"], DEFAULT_CHANNEL)
            ids_by_channel.setdefault(channel, []).append(c["id"])

        facts: list[dict] = []
        for channel, ids in ids_by_channel.items():
            # /stats 는 한 번에 최대 100개 id → 청크로 나눠 호출 후 합산
            data: list[dict] = []
            for i in range(0, len(ids), 100):
                data += (self.stats(ids[i:i + 100], date).get("data") or [])
            facts += naver_sa_to_facts(date, {"data": data}, channel=channel)
        return facts

    def close(self) -> None:
        self._http.close()
