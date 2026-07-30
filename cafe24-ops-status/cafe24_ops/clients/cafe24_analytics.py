"""카페24 통계(Analytics) API 클라이언트 — 관리자 '통계' 화면의 데이터.

Admin API(주문/상품/회원)와 **별도 호스트**(ca-api.cafe24data.com)이고 경로 접두어가
없다(예: /visitors/view). 인증은 Admin API 와 같은 OAuth Bearer 토큰을 쓴다.

2026-07-29 라이브 probe 로 확인된 것(문서만 믿지 않고 실제로 쏴본 결과):
  ✅ /visitors/view       일자별 방문/신규/재방문
  ✅ /visitpaths/domains  유입 도메인(instagram.com 등)
  ✅ /visitpaths/keywords 유입 검색어 ← **GA4 에 없는 데이터**(네이버·구글이 가림)
  ✅ /pages/view          페이지별 조회/방문
  ✅ /products/view       상품별 조회수
  ❌ /carts/*, /sales/*, /members/*, /adeffect/* 는 이 이름으로는 404
     (권한 문제가 아니라 경로명이 다름 — more_info: "No endpoint GET ...")

GA4 와 겹치는 지표(방문자·페이지)는 서로 정의가 달라 값이 다르다.
카페24 visit_count 는 '방문(세션 유사)', GA4 totalUsers 는 '사용자'다. 대시보드는
GA4 를 방문자 기준으로 쓰고, 카페24 통계는 **검색어·유입도메인처럼 GA4 가 못 주는
것**과 교차검증용으로 쓴다.
"""
from __future__ import annotations

import logging

import httpx

log = logging.getLogger(__name__)

BASE_URL = "https://ca-api.cafe24data.com"


class Cafe24AnalyticsClient:
    """토큰은 Admin 클라이언트에서 빌려 쓴다(같은 OAuth 토큰).

    Admin 클라이언트를 주입받아 access_token 을 **호출 시점에** 읽는다.
    Admin 쪽에서 토큰이 갱신되면 자동으로 새 토큰을 쓰게 된다(값 복사 금지).
    """

    def __init__(self, admin_client, transport: httpx.BaseTransport | None = None,
                 timeout: float = 30.0):
        self._admin = admin_client
        self.mall_id = admin_client.mall_id
        self._http = httpx.Client(base_url=BASE_URL, transport=transport, timeout=timeout)
        # 부분 실패를 파이프라인에 알리기 위한 마지막 오류
        self.last_partial_error: str | None = None

    def close(self) -> None:
        self._http.close()

    def _get(self, path: str, date_from: str, date_to: str, **extra) -> dict | None:
        """실패해도 예외를 올리지 않고 None — 통계는 보조 지표라 하루 수집 전체를
        날리면 안 된다. 대신 사유를 last_partial_error 에 남겨 브리핑 경고로 뜨게 한다."""
        params = {
            "mall_id": self.mall_id,
            "shop_no": 1,
            "start_date": date_from,
            "end_date": date_to,
            "format": "json",
            **extra,
        }
        headers = {"Authorization": f"Bearer {self._admin.access_token}",
                   "Content-Type": "application/json"}
        try:
            r = self._http.get(path, params=params, headers=headers)
        except httpx.HTTPError as exc:
            self.last_partial_error = f"{path}: {type(exc).__name__}: {exc}"
            log.warning("카페24통계 %s 요청 실패: %s", path, exc)
            return None
        if r.status_code == 401:
            # Admin 쪽에서 갱신하도록 유도(여기서 직접 갱신하면 토큰 회전이 엉킨다)
            try:
                self._admin.get("/api/v2/admin/orders/count",
                                {"start_date": date_from, "end_date": date_to})
            except httpx.HTTPError:
                pass
            headers["Authorization"] = f"Bearer {self._admin.access_token}"
            r = self._http.get(path, params=params, headers=headers)
        if r.status_code != 200:
            self.last_partial_error = f"{path}: HTTP {r.status_code} {r.text[:200]}"
            log.warning("카페24통계 %s HTTP %s: %s", path, r.status_code, r.text[:200])
            return None
        try:
            return r.json()
        except ValueError as exc:
            self.last_partial_error = f"{path}: JSON 파싱 실패 {exc}"
            return None

    # ── 방문 ─────────────────────────────────────────────────────
    def daily_visitors(self, date_from: str, date_to: str) -> list[dict]:
        """[{date, visits, first_visits, re_visits}] — 일자별.

        응답 date 는 '2026-07-22T00:00+09:00' 형태라 앞 10자만 잘라 쓴다.
        """
        data = self._get("/visitors/view", date_from, date_to) or {}
        out = []
        for row in data.get("view") or []:
            d = str(row.get("date") or "")[:10]
            if not d:
                continue
            out.append({
                "date": d,
                "visits": float(row.get("visit_count") or 0),
                "first_visits": float(row.get("first_visit_count") or 0),
                "re_visits": float(row.get("re_visit_count") or 0),
            })
        return out

    # ── 유입 경로 ────────────────────────────────────────────────
    def referrer_domains(self, date_from: str, date_to: str, limit: int = 30) -> list[dict]:
        """[{domain, visits}] — 유입 도메인 상위. GA4 채널과 교차검증용."""
        data = self._get("/visitpaths/domains", date_from, date_to) or {}
        rows = [
            {"domain": str(r.get("domain") or "").strip(),
             "visits": float(r.get("visit_count") or 0)}
            for r in (data.get("domains") or [])
            if str(r.get("domain") or "").strip()
        ]
        return sorted(rows, key=lambda x: -x["visits"])[:limit]

    def search_keywords(self, date_from: str, date_to: str, limit: int = 50) -> list[dict]:
        """[{keyword, visits}] — 자연 검색으로 들어온 **실제 검색어**.

        GA4 는 네이버·구글이 검색어를 가려 'organic' 까지만 보인다. 이건 카페24만 준다.
        광고 키워드(source='keyword')와 나란히 보면 "돈 안 쓰고 들어오는 말"을 알 수 있다.
        """
        data = self._get("/visitpaths/keywords", date_from, date_to) or {}
        rows = [
            {"keyword": str(r.get("keyword") or "").strip(),
             "visits": float(r.get("visit_count") or 0)}
            for r in (data.get("keywords") or [])
            if str(r.get("keyword") or "").strip()
        ]
        return sorted(rows, key=lambda x: -x["visits"])[:limit]

    # ── 페이지 / 상품 ────────────────────────────────────────────
    def page_views(self, date_from: str, date_to: str, limit: int = 30) -> list[dict]:
        """[{url, views, visits, first_visits}] — 페이지별. GA4 는 제목, 이건 URL 기준."""
        data = self._get("/pages/view", date_from, date_to) or {}
        rows = [
            {"url": str(r.get("url") or "").strip(),
             "views": float(r.get("count") or 0),
             "visits": float(r.get("visit_count") or 0),
             "first_visits": float(r.get("first_visit_count") or 0)}
            for r in (data.get("view") or [])
            if str(r.get("url") or "").strip()
        ]
        return sorted(rows, key=lambda x: -x["views"])[:limit]

    def product_views(self, date_from: str, date_to: str, limit: int = 30) -> list[dict]:
        """[{product_no, product_name, views}] — 상품별 조회수.

        카페24 주문 데이터의 '상품별 매출'과 짝지으면 **조회는 많은데 안 팔리는 상품**을
        찾을 수 있다(상세페이지·가격·품절 점검 대상).
        """
        data = self._get("/products/view", date_from, date_to) or {}
        rows = [
            {"product_no": r.get("product_no"),
             "product_name": str(r.get("product_name") or "").strip(),
             "views": float(r.get("count") or 0)}
            for r in (data.get("view") or [])
            if r.get("product_no") is not None
        ]
        return sorted(rows, key=lambda x: -x["views"])[:limit]
