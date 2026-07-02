"""네이버 검색 API 커넥터 (경쟁사 상품·후기·프로모션 실수집).

데이터랩과 동일한 네이버 개발자 앱(NAVER_CLIENT_ID/SECRET)으로 인증한다.
- 쇼핑 검색 → 경쟁사 베스트 상품(bestseller) + 최저가 + 할인 신호(active_promotions)
- 블로그 검색 → 당일 후기 글 수(new_reviews)

브랜드 정확매칭으로 동음이의 노이즈(예: '컴포트' vs '컴포트랩')를 제거한다.
응답 매핑은 단위 테스트로 검증, HTTP는 실 키로 검증 권장.
참고: https://developers.naver.com/docs/serviceapi/search/
"""
from __future__ import annotations

import os
import re

import httpx

NAVER_BASE = "https://openapi.naver.com"
_TAG = re.compile(r"</?b>")
# 할인/프로모션 신호 (정규화된 소문자 기준)
DISCOUNT_SIGNALS = ("할인", "세일", "특가", "쿠폰", "%", "무료배송", "1+1", "sale", "기획")


def _clean(title: str) -> str:
    return _TAG.sub("", title or "").strip()


def _norm(s: str) -> str:
    """태그 제거 + 공백 제거 + 소문자 — 정확매칭/신호탐지용."""
    return _TAG.sub("", s or "").replace(" ", "").lower()


def _blob(item: dict) -> str:
    # 쇼핑 응답은 brand/maker/mallName 에 브랜드가 있을 수 있어 함께 본다(블로그엔 없음→무해).
    return "".join(_norm(item.get(k, "")) for k in
                   ("title", "description", "brand", "maker", "mallName"))


def is_relevant(item: dict, name: str) -> bool:
    """제목/본문에 브랜드명이 정확히 포함되는지(공백·태그 무시)."""
    return _norm(name) in _blob(item)


def shop_to_bestsellers(date: str, name: str, raw: dict, top: int = 3) -> list[dict]:
    """쇼핑 검색 → 베스트 상품 facts(rank=1..top, dims.product/price). 관련 상품만."""
    items = [it for it in ((raw or {}).get("items") or []) if is_relevant(it, name)]
    out: list[dict] = []
    for rank, it in enumerate(items[:top], start=1):
        out.append({
            "date": date, "source": "competitor", "metric": "bestseller", "value": float(rank),
            "dims": {"competitor": name, "product": _clean(it.get("title")),
                     "price": float(it.get("lprice", 0) or 0)},
        })
    return out


def shop_to_promotions(date: str, name: str, raw: dict) -> list[dict]:
    """쇼핑 상위 결과 중 할인 신호가 있는 상품 수 → active_promotions(휴리스틱)."""
    items = [it for it in ((raw or {}).get("items") or []) if is_relevant(it, name)]
    promo = sum(1 for it in items if any(sig in _blob(it) for sig in DISCOUNT_SIGNALS))
    return [{
        "date": date, "source": "competitor", "metric": "active_promotions",
        "value": float(promo), "dims": {"competitor": name},
    }]


def blog_to_reviews(date: str, name: str, raw: dict) -> list[dict]:
    """블로그 검색 → 당일 작성된 '관련' 후기 글 수(new_reviews)."""
    compact = date.replace("-", "")
    items = (raw or {}).get("items", []) or []
    today = sum(1 for it in items if (it.get("postdate") or "") == compact and is_relevant(it, name))
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
        """경쟁사별 베스트·프로모션·후기 수집. 한 곳이 실패해도 나머지는 계속."""
        import logging

        out: list[dict] = []
        for name in names:
            if not name:
                continue
            try:
                shop = self.search("shop", name, display=20, sort="sim")
                out += shop_to_bestsellers(date, name, shop, top)
                out += shop_to_promotions(date, name, shop)
                blog = self.search("blog", name, display=100, sort="date")
                out += blog_to_reviews(date, name, blog)
            except Exception as e:  # noqa: BLE001 - 경쟁사 단위 격리
                logging.warning("[competitor] 네이버 검색 실패 (%s): %s", name, e)
        return out

    def close(self) -> None:
        self._http.close()
