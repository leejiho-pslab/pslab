"""네이버 검색광고(SearchAd) — 무료 API 커넥터.

인증: HMAC-SHA256 서명(X-API-KEY/X-Customer/X-Timestamp/X-Signature).
계정 전체 통계는 캠페인 id 목록을 받아 /stats 로 집계한다.
캠페인 유형(campaignTp)별로 파워링크(WEB_SITE)/플레이스(PLACE)를 분리 집계해
별도 채널(naver_powerlink / naver_place)로 대시보드에 노출한다.
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

# campaignTp(네이버 SA API) → 대시보드 채널 키
CAMPAIGN_TYPE_CHANNEL = {
    "WEB_SITE": "naver_powerlink",   # 파워링크
    "PLACE": "naver_place",          # 플레이스
}
DEFAULT_CHANNEL = "naver_other"      # 쇼핑검색/파워컨텐츠/브랜드검색 등 기타 유형

# 키워드 메타(계정별) 프로세스 캐시 — 백필(다일)에서 날짜마다 재크롤 방지.
_ID_META_CACHE: dict[str, dict] = {}


def sign(secret_key: str, timestamp: str, method: str, path: str) -> str:
    message = f"{timestamp}.{method}.{path}"
    digest = hmac.new(secret_key.encode(), message.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def naver_sa_to_facts(date: str, raw: dict, channel: str = "naver") -> list[dict]:
    """SA /stats 응답 → 표준 metric 레코드(dims.channel=channel)."""
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


def naver_sa_keyword_rows_to_facts(date: str, rows: list[dict], id_meta: dict[str, dict]) -> list[dict]:
    """/stats 의 per-id 행 목록 + {id: 메타} → source='naver_keyword' facts.

    각 행의 id 로 키워드/캠페인/광고그룹/채널 메타를 되찾아 dims 에 실어준다.
    메타에 없는 id(현재 계정 대상 외) 행은 무시한다.
    """
    out: list[dict] = []
    for d in rows or []:
        meta = id_meta.get(d.get("id"))
        if not meta:
            continue
        dims = {"keyword": meta["keyword"], "campaign": meta["campaign"],
                "adgroup": meta["adgroup"], "channel": meta["channel"]}
        values = {
            "ad_cost": float(d.get("salesAmt", 0) or 0),   # SA salesAmt = 광고비(지출액)
            "impressions": float(d.get("impCnt", 0) or 0),
            "clicks": float(d.get("clkCnt", 0) or 0),
            "conversions": float(d.get("ccnt", 0) or 0),
            "ad_sales": float(d.get("convAmt", 0) or 0),
        }
        for k, v in values.items():
            out.append({"date": date, "source": "naver_keyword", "metric": k,
                        "value": v, "dims": dims})
    return out


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
        """캠페인 목록 — id + 유형(campaignTp: WEB_SITE=파워링크, PLACE=플레이스 등) + 이름."""
        data = self._get("/ncc/campaigns", {})
        items = data if isinstance(data, list) else data.get("data", [])
        return [
            {"id": c.get("nccCampaignId"), "type": c.get("campaignTp"), "name": c.get("name")}
            for c in items if c.get("nccCampaignId")
        ]

    def list_adgroups(self, campaign_id: str) -> list[dict]:
        """캠페인의 광고그룹 목록 — id + 이름."""
        data = self._get("/ncc/adgroups", {"nccCampaignId": campaign_id})
        items = data if isinstance(data, list) else data.get("data", [])
        return [
            {"id": a.get("nccAdgroupId"), "name": a.get("name")}
            for a in items if a.get("nccAdgroupId")
        ]

    def list_keywords(self, adgroup_id: str) -> list[dict]:
        """광고그룹의 키워드 목록 — id + 키워드 텍스트."""
        data = self._get("/ncc/keywords", {"nccAdgroupId": adgroup_id})
        items = data if isinstance(data, list) else data.get("data", [])
        return [
            {"id": k.get("nccKeywordId"), "keyword": k.get("keyword")}
            for k in items if k.get("nccKeywordId")
        ]

    def list_campaign_ids(self) -> list[str]:
        """하위호환용 — 유형 구분 없이 전체 캠페인 id만 필요할 때."""
        return [c["id"] for c in self.list_campaigns()]

    def stats(self, ids: list[str], date: str) -> dict:
        # ids 는 배열(반복 파라미터)로 전송해야 함 — 콤마 결합은 '잘못된 파라미터 형식' 오류.
        params = {
            "ids": list(ids),
            "fields": json.dumps(["impCnt", "clkCnt", "salesAmt", "ccnt", "convAmt"]),
            "timeRange": json.dumps({"since": date, "until": date}),
        }
        return self._get("/stats", params)

    def _stats_for_ids(self, ids: list[str], date: str) -> dict:
        # /stats 는 한 번에 최대 100개 id → 청크로 나눠 호출 후 합산
        data: list[dict] = []
        for i in range(0, len(ids), 100):
            data += (self.stats(ids[i:i + 100], date).get("data") or [])
        return {"data": data}

    def _build_keyword_id_meta(self) -> dict[str, dict]:
        """{엔티티 id: {keyword,campaign,adgroup,channel}} — 캠페인→광고그룹→키워드 크롤.

        날짜와 무관한 메타이므로 프로세스 단위로 캐시한다(백필에서 31일치를 매번 다시
        크롤하면 수백 콜이 반복돼 매우 느림). 캐시 키는 계정(customer_id).
        """
        cached = _ID_META_CACHE.get(self.customer_id)
        if cached is not None:
            return cached
        id_meta: dict[str, dict] = {}
        for c in self.list_campaigns():
            channel = CAMPAIGN_TYPE_CHANNEL.get(c["type"], DEFAULT_CHANNEL)
            cname = c.get("name") or c["id"]
            for ag in self.list_adgroups(c["id"]):
                aname = ag.get("name") or ag["id"]
                if channel == "naver_powerlink":
                    for k in self.list_keywords(ag["id"]):
                        id_meta[k["id"]] = {
                            "keyword": k.get("keyword") or "-", "campaign": cname,
                            "adgroup": aname, "channel": channel, "entity": "keyword",
                        }
                else:
                    # 플레이스/쇼핑 등 키워드 없는 유형 → 광고그룹 단위 집계
                    id_meta[ag["id"]] = {
                        "keyword": "-", "campaign": cname, "adgroup": aname,
                        "channel": channel, "entity": "adgroup",
                    }
        _ID_META_CACHE[self.customer_id] = id_meta
        return id_meta

    def fetch_keyword_facts(self, date: str) -> list[dict]:
        """키워드 단위 리포트 facts(source='naver_keyword').

        파워링크(WEB_SITE) 캠페인은 키워드별, 그 외(플레이스 등)는 키워드가 없어
        광고그룹 단위(키워드='-')로 /stats 를 조회한다. /stats 응답의 각 행은 조회한
        엔티티 id(row['id'])를 담고 있어 이를 키워드/광고그룹 메타에 되매핑한다.

        주의: /stats 는 한 호출의 ids 가 동일 엔티티 유형이어야 한다(키워드+광고그룹을
        섞으면 400). 따라서 유형별로 나눠 호출한 뒤 합친다.
        """
        id_meta = self._build_keyword_id_meta()
        if not id_meta:
            return []
        rows: list[dict] = []
        for entity in ("keyword", "adgroup"):
            ids = [i for i, m in id_meta.items() if m.get("entity") == entity]
            if ids:
                rows += self._stats_for_ids(ids, date).get("data") or []
        return naver_sa_keyword_rows_to_facts(date, rows, id_meta)

    def fetch_facts(self, date: str) -> list[dict]:
        """캠페인 유형별(파워링크/플레이스/기타)로 나눠 각각 채널 facts 를 생성."""
        campaigns = self.list_campaigns()
        if not campaigns:
            return []
        ids_by_channel: dict[str, list[str]] = {}
        for c in campaigns:
            channel = CAMPAIGN_TYPE_CHANNEL.get(c["type"], DEFAULT_CHANNEL)
            ids_by_channel.setdefault(channel, []).append(c["id"])

        records: list[dict] = []
        for channel, ids in ids_by_channel.items():
            raw = self._stats_for_ids(ids, date)
            records += naver_sa_to_facts(date, raw, channel=channel)
        return records

    def close(self) -> None:
        self._http.close()
