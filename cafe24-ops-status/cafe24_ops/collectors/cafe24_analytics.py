"""카페24 접속통계 수집기 — 관리자 '통계' 데이터를 facts 로 적재.

GA4 가 못 주는 것을 메우는 게 목적이다:
  - **상품별 장바구니 담기율**: GA4 퍼널이 "장바구니 담기"를 병목으로 지목해도
    어느 상품 때문인지는 모른다. 이건 상품 단위로 조회→담기→담기율을 준다.
  - **유입 검색어**: 네이버·구글이 가려 GA4 는 'organic' 까지만 보인다.
  - **유입 도메인 / 광고 채널 방문**: GA4 채널 분류와 교차검증.
  - **상품별 조회 vs 매출**: '많이 보는데 안 팔리는 상품' 식별.
  - **회원/비회원 매출**: 재구매 유도 여지 판단.

source 를 나눠 적재한다:
  c24_visit    일자별 방문/신규/재방문 (스칼라)
  c24_keyword  검색어별 방문        (dims.keyword)
  c24_referrer 유입 도메인별 방문    (dims.domain)
  c24_adpath   광고 채널별 방문      (dims.ad)
  c24_page     페이지 URL별 조회/방문 (dims.url)
  c24_product  상품별 조회/담기/주문/매출 (dims.product, dims.product_no)
  c24_member   회원/비회원 주문수·금액 (스칼라)

활성화: 카페24 토큰에 mall.read_analytics scope 필요(없으면 전부 403).
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector

# mock 샘플 — 2026-07-30 라이브 응답에서 관찰된 실제 값 형태.
_MOCK_KEYWORDS = ["KEEK", "키크", "KEEK목베개", "여행용목베개", "기내용목베개",
                  "필로우디", "목베개후드", "목베개추천"]
_MOCK_DOMAINS = ["참조 도메인 없음", "instagram.com", "m.search.naver.com",
                 "syndicatedsearch.goog", "search.naver.com", "google.com"]
_MOCK_ADS = ["criteo", "채널 없음", "sns", "네이버", "KK_BS_MO", "KK_powerlink_MO", "ig"]
_MOCK_URLS = ["/product/detail.html", "/product/list.html", "/",
              "/order/basket.html", "/board/review"]
_MOCK_PRODUCTS = [
    (1833, "keek Pillowdy UV Light Windbreaker V3"),
    (1882, "keek Pillowdy Utility Light Vest (Single-layer)"),
    (1883, "keek Flexible Air Tube Kit"),
    (1795, "keek Pillowdy Logo Hoodie V3"),
]


def _rng(date: str, salt: str) -> random.Random:
    seed = int(hashlib.sha256(f"{date}:{salt}".encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


class Cafe24AnalyticsCollector(BaseCollector):
    source = "c24_visit"

    def collect_mock(self, date: str) -> list[dict]:
        r = _rng(date, "c24_analytics")
        out: list[dict] = []

        visits = float(r.randint(1800, 2600))
        first = round(visits * r.uniform(0.45, 0.6))
        for k, v in (("c24_visits", visits), ("c24_first_visits", float(first)),
                     ("c24_re_visits", float(visits - first))):
            out.append({"date": date, "source": "c24_visit", "metric": k, "value": v})

        def _visits_block(source: str, dim: str, names: list[str], pool: float) -> None:
            rem = pool
            for n in names:
                v = max(1.0, round(rem * r.uniform(0.15, 0.55)))
                rem = max(0.0, rem - v)
                out.append({"date": date, "source": source, "metric": "visits",
                            "value": v, "dims": {dim: n}})

        _visits_block("c24_keyword", "keyword", _MOCK_KEYWORDS, visits * 0.12)
        _visits_block("c24_referrer", "domain", _MOCK_DOMAINS, visits)
        _visits_block("c24_adpath", "ad", _MOCK_ADS, visits)

        for url in _MOCK_URLS:
            views = float(r.randint(200, 1800))
            for metric, val in (("views", views),
                                ("visits", round(views * r.uniform(0.5, 0.9))),
                                ("first_visits", round(views * r.uniform(0.1, 0.4)))):
                out.append({"date": date, "source": "c24_page", "metric": metric,
                            "value": float(val), "dims": {"url": url}})

        for no, name in _MOCK_PRODUCTS:
            views = float(r.randint(80, 600))
            # 담기율은 상품마다 크게 벌어지도록(실제로 1%~4% 차이가 났다)
            cart_rate = r.uniform(0.8, 4.5)
            cart_adds = round(views * cart_rate / 100)
            orders = float(r.randint(0, max(1, int(cart_adds * 0.6))))
            dims = {"product": name, "product_no": str(no)}
            for metric, val in (("views", views),
                                ("cart_adds", float(cart_adds)),
                                ("cart_rate", round(cart_rate, 2)),
                                ("orders", orders),
                                ("quantity", orders),
                                ("amount", orders * r.uniform(50_000, 180_000))):
                out.append({"date": date, "source": "c24_product", "metric": metric,
                            "value": float(val), "dims": dims})

        m_orders = float(r.randint(0, 15))
        n_orders = float(r.randint(0, 15))
        for k, v in (("member_orders", m_orders),
                     ("member_amount", m_orders * r.uniform(60_000, 160_000)),
                     ("nonmember_orders", n_orders),
                     ("nonmember_amount", n_orders * r.uniform(60_000, 160_000))):
            out.append({"date": date, "source": "c24_member", "metric": k, "value": float(v)})
        return out

    def collect_live(self, date: str) -> list[dict]:
        from ..clients import Cafe24Client
        from ..clients.cafe24_analytics import Cafe24AnalyticsClient
        from ..store import Store

        kv = Store(self.config.data_dir)
        try:
            admin = Cafe24Client.from_store(self.config, kv)
            client = Cafe24AnalyticsClient(admin)
            try:
                return self._fetch(client, date)
            finally:
                client.close()
                admin.close()
        finally:
            kv.close()

    def _fetch(self, client, date: str) -> list[dict]:
        out: list[dict] = []

        for row in client.daily_visitors(date, date):
            # 통계 API 는 기간 조회라 다른 날짜가 섞일 수 있어 요청일만 취한다
            if row["date"] != date:
                continue
            for metric, key in (("c24_visits", "visits"),
                                ("c24_first_visits", "first_visits"),
                                ("c24_re_visits", "re_visits")):
                out.append({"date": date, "source": "c24_visit",
                            "metric": metric, "value": row[key]})

        for source, dim, rows in (
            ("c24_keyword", "keyword", client.search_keywords(date, date)),
            ("c24_referrer", "domain", client.referrer_domains(date, date)),
            ("c24_adpath", "ad", client.ad_paths(date, date)),
        ):
            for row in rows:
                out.append({"date": date, "source": source, "metric": "visits",
                            "value": row["visits"], "dims": {dim: row["name"]}})

        for row in client.page_views(date, date):
            for metric in ("views", "visits", "first_visits"):
                out.append({"date": date, "source": "c24_page", "metric": metric,
                            "value": row[metric], "dims": {"url": row["url"]}})

        # 상품 지표는 세 엔드포인트(조회/담기/주문)를 상품번호로 합쳐 한 소스에 넣는다.
        # 담기율은 조회수 없이는 못 계산하므로 응답이 주는 값을 그대로 쓴다.
        merged: dict[str, dict] = {}

        def _slot(no, name) -> dict:
            key = str(no)
            e = merged.setdefault(key, {"product_no": key, "product": name, "metrics": {}})
            if name and not e["product"]:
                e["product"] = name
            return e

        for row in client.cart_actions(date, date):
            e = _slot(row["product_no"], row["product_name"])
            e["metrics"]["views"] = row["views"]
            e["metrics"]["cart_adds"] = row["cart_adds"]
            e["metrics"]["cart_rate"] = row["cart_rate"]
        for row in client.product_views(date, date):
            e = _slot(row["product_no"], row["product_name"])
            e["metrics"].setdefault("views", row["views"])
        for row in client.product_sales(date, date):
            e = _slot(row["product_no"], row["product_name"])
            e["metrics"]["orders"] = row["orders"]
            e["metrics"]["quantity"] = row["quantity"]
            e["metrics"]["amount"] = row["amount"]
        for e in merged.values():
            dims = {"product": e["product"], "product_no": e["product_no"]}
            for metric, value in e["metrics"].items():
                out.append({"date": date, "source": "c24_product", "metric": metric,
                            "value": float(value), "dims": dims})

        ms = client.member_sales(date, date)
        if ms:
            for k, v in ms.items():
                out.append({"date": date, "source": "c24_member", "metric": k,
                            "value": float(v)})

        if not out:
            # 전부 실패 → 빈 결과로 기존 데이터를 덮지 않도록 예외로 올린다.
            raise NotImplementedError(
                "[c24_visit] 카페24 통계 API 응답이 없습니다. 토큰에 "
                f"mall.read_analytics 권한이 있는지 확인하세요. "
                f"(마지막 오류: {client.last_partial_error})"
            )
        if client.last_partial_error:
            self.partial_errors["analytics"] = client.last_partial_error
        return out
