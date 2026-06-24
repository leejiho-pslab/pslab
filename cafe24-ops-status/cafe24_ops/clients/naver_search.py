"""네이버 검색 API 커넥터 (경쟁사 상품·버즈 실수집).

데이터랩과 동일한 네이버 개발자 앱(NAVER_CLIENT_ID/SECRET)으로 인증한다.
- 쇼핑 검색 → 경쟁사 베스트 상품(bestseller) + 최저가
- 블로그 검색 → 당일 후기/버즈 글 수(new_reviews)

응답 매핑은 단위 테스트로 검증, HTTP는 실 키로 검증 권장.
참고: https://developers.naver.com/docs/serviceapi/search/
"""
from __future__ import annotations

import os
import re

import httpx

NAVER_BASE = "https://openapi.naver.com"
_TAG = re.compile(r"</?b>")


def _clean(title: str) -> str:
    return _TAG.sub("", title or "").strip()


def shop_to_bestsellers(date: str, name: str, raw: dict, top: int = 3) -> list[dict]:
    """쇼핑 검색 → 베스트 상품 facts(rank=1..top, dims.product/price)."""
    items = (raw or {}).get("items", []) or []
    out: list[dict] = []
    for rank, it in enumerate(items[:top], start=1):
        price = float(it.get("lprice", 0) or 0)
        out.append({
            "date": date, "source": "competitor", "metric": "bestseller", "value": float(rank),
            "dims": {"competitor": name, "product": _clean(it.get("title")), "price": price},
        })
    return out


def blog_to_reviews(date: str, name: str, raw: dict) -> list[dict]:
    """블로그 검색 → 당일 작성된 후기 글 수(new_reviews)."""
    compact = date.replace("-", "")
    items = (raw or {}).get("items", []) or []
    today = sum(1 for it in items if (it.get("postdate") or "") == compact)
    return [{
        "date": date, "source": "competitor", "metric": "new_reviews", "value": float(today),
        "dims": {"competitor": name},
    }]


class NaverSearchClient:
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
    def from_env(cls, transport: httpx.BaseTransport | None = None) -> "NaverSearchClient":
        return cls(
            client_id=os.environ.get("NAVER_CLIENT_ID", ""),
            client_secret=os.environ.get("NAVER_CLIENT_SECRET", ""),
            transport=transport,
        )

    def search(self, kind: str, query: str, display: int = 10, sort: str = "sim") -> dict:
        r = self._http.get(
            f"/v1/search/{kind}.json",
            params={"query": query, "display": display, "sort": sort},
            headers={
                "X-Naver-Client-Id": self.client_id,
                "X-Naver-Client-Secret": self.client_secret,
            },
        )
        r.raise_for_status()
        return r.json()

    def fetch_competitor_facts(self, date: str, names: list[str], top: int = 3) -> list[dict]:
        out: list[dict] = []
        for name in names:
            if not name:
                continue
            out += shop_to_bestsellers(date, name, self.search("shop", name, display=top, sort="sim"), top)
            out += blog_to_reviews(date, name, self.search("blog", name, display=100, sort="date"))
        return out

    def close(self) -> None:
        self._http.close()
