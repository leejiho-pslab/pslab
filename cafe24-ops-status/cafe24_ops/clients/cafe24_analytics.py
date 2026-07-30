"""카페24 통계(Analytics) API 클라이언트 — 관리자 '통계' 화면의 데이터.

Admin API(주문/상품/회원)와 **별도 호스트**(ca-api.cafe24data.com)이고 경로 접두어가
없다(예: /visitors/view). 인증은 Admin API 와 같은 OAuth Bearer 토큰을 쓰되
**mall.read_analytics scope 가 필수**다(없으면 전부 403 INVALID SCOPE).

2026-07-30 라이브 probe 로 확인된 실제 경로(문서만 믿지 않고 전수 탐색한 결과).
이름을 추측하기 어려웠던 것들이 있어(예: /carts/view 가 아니라 /carts/action)
아래 목록이 이 프로젝트의 사실상 스펙이다:

  /visitors/view      일자별 방문/신규/재방문
  /visitpaths/domains 유입 도메인 (instagram.com 등)
  /visitpaths/keywords 유입 **검색어** ← GA4 에 없는 데이터(네이버·구글이 가림)
  /visitpaths/ads     광고 채널별 방문 (criteo/sns/네이버/KK_BS_MO ...)
  /pages/view         페이지 URL별 조회/방문
  /products/view      상품별 조회수
  /products/sales     상품별 주문수/수량/매출
  /carts/action       상품별 **조회 → 장바구니 담기 → 담기율** ← 구매 퍼널의 핵심
  /members/sales      회원/비회원 주문수·금액

없는 경로(확인됨): /carts/view·/carts/products, /sales/*, /orders/*, /members/view,
/adeffect/*, /visitors/hours·devices·newandreturn, /pages/exit·entrance,
/products/buy·carts·best — 총 52개. 추측으로 다시 호출하지 말 것.
"""
from __future__ import annotations

import logging

import httpx

log = logging.getLogger(__name__)

BASE_URL = "https://ca-api.cafe24data.com"


def _f(v) -> float:
    """응답에 숫자가 문자열로 오는 필드가 섞여 있다(order_amount: "1908000")."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


class Cafe24AnalyticsClient:
    """토큰은 Admin 클라이언트에서 빌려 쓴다(같은 OAuth 토큰).

    access_token 을 복사해 두지 않고 **호출 시점에** 읽는다 — Admin 쪽에서 갱신되면
    자동으로 새 토큰을 쓰게 된다.
    """

    def __init__(self, admin_client, transport: httpx.BaseTransport | None = None,
                 timeout: float = 30.0):
        self._admin = admin_client
        self.mall_id = admin_client.mall_id
        self._http = httpx.Client(base_url=BASE_URL, transport=transport, timeout=timeout)
        # 부분 실패를 파이프라인 경고로 올리기 위한 마지막 오류
        self.last_partial_error: str | None = None

    def close(self) -> None:
        self._http.close()

    def _get(self, path: str, date_from: str, date_to: str, key: str) -> list[dict]:
        """실패해도 예외 없이 빈 리스트 — 통계는 보조 지표라 하루 수집 전체를 막지 않는다.
        대신 사유를 last_partial_error 에 남겨 브리핑 경고로 뜨게 한다."""
        params = {"mall_id": self.mall_id, "shop_no": 1,
                  "start_date": date_from, "end_date": date_to, "format": "json"}
        headers = {"Authorization": f"Bearer {self._admin.access_token}",
                   "Content-Type": "application/json"}
        try:
            r = self._http.get(path, params=params, headers=headers)
            if r.status_code == 401:
                # 갱신은 Admin 클라이언트에 맡긴다(여기서 직접 하면 토큰 회전이 엉킨다)
                self._admin.get("/api/v2/admin/orders/count",
                                {"start_date": date_from, "end_date": date_to})
                headers["Authorization"] = f"Bearer {self._admin.access_token}"
                r = self._http.get(path, params=params, headers=headers)
        except httpx.HTTPError as exc:
            self.last_partial_error = f"{path}: {type(exc).__name__}: {exc}"
            log.warning("카페24통계 %s 요청 실패: %s", path, exc)
            return []
        if r.status_code != 200:
            self.last_partial_error = f"{path}: HTTP {r.status_code} {r.text[:200]}"
            log.warning("카페24통계 %s HTTP %s: %s", path, r.status_code, r.text[:200])
            return []
        try:
            return (r.json() or {}).get(key) or []
        except ValueError as exc:
            self.last_partial_error = f"{path}: JSON 파싱 실패 {exc}"
            return []

    # ── 방문 ─────────────────────────────────────────────────────
    def daily_visitors(self, date_from: str, date_to: str) -> list[dict]:
        """[{date, visits, first_visits, re_visits}].
        응답 date 는 '2026-07-23T00:00+09:00' 형태라 앞 10자만 쓴다."""
        out = []
        for row in self._get("/visitors/view", date_from, date_to, "view"):
            d = str(row.get("date") or "")[:10]
            if d:
                out.append({"date": d,
                            "visits": _f(row.get("visit_count")),
                            "first_visits": _f(row.get("first_visit_count")),
                            "re_visits": _f(row.get("re_visit_count"))})
        return out

    # ── 유입 경로 ────────────────────────────────────────────────
    def _visits_by(self, path: str, key: str, field: str,
                   date_from: str, date_to: str, limit: int) -> list[dict]:
        rows = [{"name": str(r.get(field) or "").strip(), "visits": _f(r.get("visit_count"))}
                for r in self._get(path, date_from, date_to, key)
                if str(r.get(field) or "").strip()]
        return sorted(rows, key=lambda x: -x["visits"])[:limit]

    def referrer_domains(self, date_from: str, date_to: str, limit: int = 30) -> list[dict]:
        """유입 도메인 상위. '참조 도메인 없음' = 직접 유입·앱 내 이동 등."""
        return self._visits_by("/visitpaths/domains", "domains", "domain",
                               date_from, date_to, limit)

    def search_keywords(self, date_from: str, date_to: str, limit: int = 50) -> list[dict]:
        """자연 검색으로 들어온 **실제 검색어**.
        GA4 는 네이버·구글이 가려 'organic' 까지만 보인다 — 이건 카페24만 준다."""
        return self._visits_by("/visitpaths/keywords", "keywords", "keyword",
                               date_from, date_to, limit)

    def ad_paths(self, date_from: str, date_to: str, limit: int = 30) -> list[dict]:
        """광고 채널별 방문(criteo/sns/네이버/KK_BS_MO ...). GA4 채널과 교차검증용."""
        return self._visits_by("/visitpaths/ads", "ads", "ad", date_from, date_to, limit)

    # ── 페이지 ───────────────────────────────────────────────────
    def page_views(self, date_from: str, date_to: str, limit: int = 30) -> list[dict]:
        rows = [{"url": str(r.get("url") or "").strip(),
                 "views": _f(r.get("count")),
                 "visits": _f(r.get("visit_count")),
                 "first_visits": _f(r.get("first_visit_count"))}
                for r in self._get("/pages/view", date_from, date_to, "view")
                if str(r.get("url") or "").strip()]
        return sorted(rows, key=lambda x: -x["views"])[:limit]

    # ── 상품 (조회 → 담기 → 주문) ────────────────────────────────
    def product_views(self, date_from: str, date_to: str, limit: int = 50) -> list[dict]:
        rows = [{"product_no": r.get("product_no"),
                 "product_name": str(r.get("product_name") or "").strip(),
                 "views": _f(r.get("count"))}
                for r in self._get("/products/view", date_from, date_to, "view")
                if r.get("product_no") is not None]
        return sorted(rows, key=lambda x: -x["views"])[:limit]

    def product_sales(self, date_from: str, date_to: str, limit: int = 50) -> list[dict]:
        """상품별 주문수/수량/매출 — 조회수와 짝지어 '보기만 하고 안 사는' 상품을 찾는다."""
        rows = [{"product_no": r.get("product_no"),
                 "product_name": str(r.get("product_name") or "").strip(),
                 "orders": _f(r.get("order_count")),
                 "quantity": _f(r.get("order_product_count")),
                 "amount": _f(r.get("order_amount"))}
                for r in self._get("/products/sales", date_from, date_to, "sales")
                if r.get("product_no") is not None]
        return sorted(rows, key=lambda x: -x["amount"])[:limit]

    def cart_actions(self, date_from: str, date_to: str, limit: int = 50) -> list[dict]:
        """상품별 **조회 → 장바구니 담기 → 담기율**.

        GA4 퍼널이 "장바구니 담기"를 병목으로 지목했을 때, 그게 **어느 상품 때문인지**를
        여기서 알 수 있다. 담기율이 유독 낮은 상품은 가격·옵션·품절·상세페이지 점검 대상.
        add_cart_rate 는 문자열("1.02")로 온다.
        """
        rows = [{"product_no": r.get("product_no"),
                 "product_name": str(r.get("product_name") or "").strip(),
                 "views": _f(r.get("count")),
                 "cart_adds": _f(r.get("add_cart_count")),
                 "cart_rate": _f(r.get("add_cart_rate"))}
                for r in self._get("/carts/action", date_from, date_to, "action")
                if r.get("product_no") is not None]
        return sorted(rows, key=lambda x: -x["views"])[:limit]

    # ── 회원/비회원 ──────────────────────────────────────────────
    def member_sales(self, date_from: str, date_to: str) -> dict | None:
        """{member_orders, member_amount, nonmember_orders, nonmember_amount}.
        비회원 비중이 높으면 재구매 유도(가입 혜택·CRM)의 여지가 크다는 신호."""
        rows = self._get("/members/sales", date_from, date_to, "sales")
        if not rows:
            return None
        r = rows[0]
        return {
            "member_orders": _f(r.get("member_order_count")),
            "member_amount": _f(r.get("member_order_amount")),
            "nonmember_orders": _f(r.get("nonmember_order_count")),
            "nonmember_amount": _f(r.get("nonmember_order_amount")),
        }
