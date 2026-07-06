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
import logging
import os
import time

import httpx

log = logging.getLogger(__name__)

NAVER_SA_BASE = "https://api.searchad.naver.com"

# 네이버SA API 는 초당 호출 제한이 있어(공식 권장: 요청 간 0.5초 이상 간격), 캠페인/광고그룹/
# 키워드 계층을 훑느라 순차 호출이 많은 키워드 리포트에서는 매 호출 사이 이 간격을 지켜야
# "정상 200 + 빈 데이터"로 조용히 누락되는 일을 막을 수 있다.
_REQ_INTERVAL = 0.5

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
        request_interval: float = 0.0,
    ):
        self.api_key = api_key
        self.secret_key = secret_key
        self.customer_id = customer_id
        self._ts = timestamp_fn  # 테스트 주입용
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)
        # 캠페인→광고그룹→키워드 계층을 훑는 키워드 리포트는 순차 호출이 많아, 라이브
        # 호출(from_account)에서만 _REQ_INTERVAL 간격을 강제한다(테스트는 0으로 즉시 실행).
        self._request_interval = request_interval
        self._last_request_ts: float | None = None

    @classmethod
    def from_account(cls, acc: dict, transport: httpx.BaseTransport | None = None) -> "NaverSearchAdClient":
        return cls(
            api_key=os.environ.get("NAVER_SA_API_KEY", ""),
            secret_key=os.environ.get("NAVER_SA_SECRET_KEY", ""),
            customer_id=str(acc.get("account_id") or os.environ.get("NAVER_SA_CUSTOMER_ID", "")),
            transport=transport,
            request_interval=_REQ_INTERVAL,
        )

    def _headers(self, method: str, path: str) -> dict:
        ts = self._ts() if self._ts else str(int(time.time() * 1000))
        return {
            "X-Timestamp": ts,
            "X-API-KEY": self.api_key,
            "X-Customer": str(self.customer_id),
            "X-Signature": sign(self.secret_key, ts, method, path),
        }

    def _throttle(self) -> None:
        if self._request_interval <= 0:
            return
        if self._last_request_ts is not None:
            wait = self._request_interval - (time.monotonic() - self._last_request_ts)
            if wait > 0:
                time.sleep(wait)
        self._last_request_ts = time.monotonic()

    def _get(self, path: str, params: dict) -> dict:
        self._throttle()
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

    def list_adgroups(self, campaign_ids: list[str]) -> list[dict]:
        """캠페인별 광고그룹 id + 이름. 키워드 리포트의 '캠페인'(실제로는 광고그룹명) 컬럼에 쓰인다."""
        out: list[dict] = []
        for cid in campaign_ids:
            data = self._get("/ncc/adgroups", {"nccCampaignId": cid})
            items = data if isinstance(data, list) else data.get("data", [])
            for a in items:
                if a.get("nccAdgroupId"):
                    out.append({"id": a["nccAdgroupId"], "campaign_id": cid, "name": a.get("name", "")})
        return out

    def list_keywords(self, adgroup_ids: list[str]) -> list[dict]:
        """광고그룹별 키워드 id + 키워드 텍스트."""
        out: list[dict] = []
        for gid in adgroup_ids:
            data = self._get("/ncc/keywords", {"nccAdgroupId": gid})
            items = data if isinstance(data, list) else data.get("data", [])
            for k in items:
                if k.get("nccKeywordId"):
                    out.append({"id": k["nccKeywordId"], "adgroup_id": gid, "keyword": k.get("keyword", "")})
        return out

    @staticmethod
    def _match_rows_to_ids(ids: list[str], rows: list[dict]) -> dict[str, dict]:
        """/stats 응답 행을 요청 id에 매칭한다.

        공식 문서에 행별 id echo 여부가 명확하지 않아 방어적으로 처리: 행에 id 계열
        필드가 있으면 그걸로 매칭하고, 없으면 요청과 같은 순서로 온다고 가정해 위치
        기반 매칭한다. 길이가 안 맞으면 매칭을 포기(빈 dict)하고 경고 로그를 남겨
        실 API 응답으로 스키마를 확인할 수 있게 한다.
        """
        id_keys = ("id", "nccKeywordId")
        if rows and any(k in rows[0] for k in id_keys):
            out = {}
            for row in rows:
                rid = next((row[k] for k in id_keys if k in row), None)
                if rid:
                    out[rid] = row
            return out
        if len(rows) == len(ids):
            return dict(zip(ids, rows))
        log.warning("네이버SA 키워드 stats: id 수(%d)와 응답 행 수(%d)가 달라 매칭 불가 — 스킵",
                    len(ids), len(rows))
        return {}

    # 실 라이브 진단 결과: 100개씩 청크로 보내면 대부분 빈 응답(행 0개)이 오고, 마지막
    # 소수 id만 남은 청크에서만 정상 응답이 왔다 — 요청 간격(스로틀)을 지켜도 동일해
    # 단순 초당 호출 제한 문제가 아니라 batch 크기 자체의 문제로 보인다. 임계값이
    # 정확히 얼마인지 문서로 확인 못해 보수적으로 작게 잡는다.
    _KEYWORD_STATS_CHUNK = 20

    def fetch_keyword_facts(self, date: str) -> list[dict]:
        """파워링크/플레이스 키워드별 성과. 캠페인→광고그룹→키워드 계층을 따라가 집계한다."""
        campaigns = [c for c in self.list_campaigns() if c["type"] in CAMPAIGN_TYPE_CHANNEL]
        if not campaigns:
            return []
        ids_by_channel: dict[str, list[str]] = {}
        for c in campaigns:
            ids_by_channel.setdefault(CAMPAIGN_TYPE_CHANNEL[c["type"]], []).append(c["id"])

        facts: list[dict] = []
        for channel, campaign_ids in ids_by_channel.items():
            adgroups = self.list_adgroups(campaign_ids)
            if not adgroups:
                continue
            adgroup_name = {a["id"]: a["name"] for a in adgroups}
            keywords = self.list_keywords([a["id"] for a in adgroups])
            if not keywords:
                continue

            rows_by_id: dict[str, dict] = {}
            kw_ids = [k["id"] for k in keywords]
            chunk_size = self._KEYWORD_STATS_CHUNK
            for i in range(0, len(kw_ids), chunk_size):
                chunk = kw_ids[i:i + chunk_size]
                data = self.stats(chunk, date).get("data") or []
                log.info("네이버SA 키워드 stats: %s 청크 %d개 id → 응답 %d행",
                         channel, len(chunk), len(data))
                rows_by_id.update(self._match_rows_to_ids(chunk, data))

            for kw in keywords:
                row = rows_by_id.get(kw["id"])
                if not row:
                    continue
                dims = {
                    "channel": channel,
                    "keyword": kw.get("keyword") or kw["id"],
                    "adgroup": adgroup_name.get(kw["adgroup_id"], ""),
                }
                values = {
                    "impressions": float(row.get("impCnt", 0) or 0),
                    "clicks": float(row.get("clkCnt", 0) or 0),
                    "ad_cost": float(row.get("salesAmt", 0) or 0),
                    "conversions": float(row.get("ccnt", 0) or 0),
                }
                for metric, value in values.items():
                    facts.append({"date": date, "source": "keyword", "metric": metric,
                                  "value": value, "dims": dims})
        return facts

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
