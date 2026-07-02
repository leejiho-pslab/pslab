"""네이버 데이터랩 검색어 트렌드 커넥터 (경쟁사 검색량/트렌드).

자격증명(NAVER_CLIENT_ID/SECRET)이 있을 때만 활성화. 응답의 ratio 는 기간 내 최대값
대비 상대 지수(0~100)다 — 절대 검색량이 아니라 '트렌드 지수'로 사용한다.

참고: https://developers.naver.com/docs/serviceapi/datalab/search/search.md
"""
from __future__ import annotations

import os

import httpx

NAVER_BASE = "https://openapi.naver.com"


def naver_trend_to_facts(raw: dict) -> list[dict]:
    """데이터랩 응답 → 표준 metric 레코드(metric=naver_search_volume, dims.competitor)."""
    out: list[dict] = []
    for res in (raw or {}).get("results", []) or []:
        name = res.get("title")
        for pt in res.get("data", []) or []:
            out.append({
                "date": pt.get("period"),
                "source": "competitor",
                "metric": "naver_search_volume",
                "value": float(pt.get("ratio", 0) or 0),
                "dims": {"competitor": name},
            })
    return out


class NaverDataLabClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        transport: httpx.BaseTransport | None = None,
        base_url: str = NAVER_BASE,
        timeout: float = 30.0,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_env(cls, transport: httpx.BaseTransport | None = None) -> "NaverDataLabClient":
        return cls(
            client_id=os.environ.get("NAVER_CLIENT_ID", ""),
            client_secret=os.environ.get("NAVER_CLIENT_SECRET", ""),
            transport=transport,
        )

    def search_trend(self, start: str, end: str, keyword_groups: list[dict], time_unit: str = "date") -> dict:
        body = {"startDate": start, "endDate": end, "timeUnit": time_unit, "keywordGroups": keyword_groups}
        r = self._http.post(
            "/v1/datalab/search",
            json=body,
            headers={
                "X-Naver-Client-Id": self.client_id,
                "X-Naver-Client-Secret": self.client_secret,
                "Content-Type": "application/json",
            },
        )
        r.raise_for_status()
        return r.json()

    def fetch_search_facts(self, start: str, end: str, competitors: list[str]) -> list[dict]:
        groups = [{"groupName": c, "keywords": [c]} for c in competitors[:5]]  # 데이터랩 그룹 최대 5
        if not groups:
            return []
        return naver_trend_to_facts(self.search_trend(start, end, groups))

    def close(self) -> None:
        self._http.close()
