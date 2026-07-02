"""카페24 Admin API 클라이언트.

OAuth 2.0 Bearer 인증 + access_token 만료 시 refresh_token 으로 자동 갱신,
limit/offset 페이지네이션을 처리한다.

httpx 기반이며, 테스트에서는 transport 를 주입해 실제 API 없이 동작을 검증한다.
참고: https://developers.cafe24.com/docs/api/admin/
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path

import httpx

DEFAULT_API_VERSION = "2026-03-01"
PAGE_LIMIT = 1000          # 카페24 orders 최대 limit
OFFSET_SAFETY = 100_000    # 무한루프 방지


class Cafe24AuthError(Exception):
    pass


class Cafe24Client:
    def __init__(
        self,
        mall_id: str,
        client_id: str,
        client_secret: str,
        access_token: str,
        refresh_token: str | None = None,
        api_version: str = DEFAULT_API_VERSION,
        token_store: Path | None = None,
        transport: httpx.BaseTransport | None = None,
        base_url: str | None = None,
        timeout: float = 30.0,
    ):
        self.mall_id = mall_id
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.api_version = api_version
        self.token_store = Path(token_store) if token_store else None
        self.base_url = base_url or f"https://{mall_id}.cafe24api.com"
        self._http = httpx.Client(base_url=self.base_url, transport=transport, timeout=timeout)

    # ---- 팩토리 -----------------------------------------------------
    @classmethod
    def from_config(
        cls,
        config,
        transport: httpx.BaseTransport | None = None,
        access_override: str | None = None,
        refresh_override: str | None = None,
    ) -> "Cafe24Client":
        """access_override/refresh_override 가 주어지면(예: DB 영속 토큰) 최우선 사용."""
        mall_id = os.environ.get("CAFE24_MALL_ID") or config.sources.shop.get("mall_id", "")
        token_store = config.data_dir / "cafe24_token.json"
        access = access_override or os.environ.get("CAFE24_ACCESS_TOKEN", "")
        refresh = refresh_override or os.environ.get("CAFE24_REFRESH_TOKEN", "")
        # override 없을 때만 파일 token_store 폴백 사용
        if not access_override and token_store.exists():
            try:
                saved = json.loads(token_store.read_text(encoding="utf-8"))
                access = saved.get("access_token") or access
                refresh = saved.get("refresh_token") or refresh
            except (ValueError, OSError):
                pass
        if not mall_id or not access:
            raise Cafe24AuthError(
                "카페24 자격증명이 없습니다. config/secrets.env 에 CAFE24_MALL_ID / "
                "CAFE24_ACCESS_TOKEN (및 CAFE24_REFRESH_TOKEN) 을 설정하세요."
            )
        return cls(
            mall_id=mall_id,
            client_id=os.environ.get("CAFE24_CLIENT_ID", ""),
            client_secret=os.environ.get("CAFE24_CLIENT_SECRET", ""),
            access_token=access,
            refresh_token=refresh,
            api_version=os.environ.get("CAFE24_API_VERSION", DEFAULT_API_VERSION),
            token_store=token_store,
            transport=transport,
        )

    # ---- 인증 -------------------------------------------------------
    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "X-Cafe24-Api-Version": self.api_version,
        }

    def _refresh(self) -> None:
        if not self.refresh_token:
            raise Cafe24AuthError("access_token 만료 — refresh_token 이 없어 갱신할 수 없습니다.")
        basic = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        resp = self._http.post(
            "/api/v2/oauth/token",
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "refresh_token", "refresh_token": self.refresh_token},
        )
        if resp.status_code != 200:
            raise Cafe24AuthError(f"토큰 갱신 실패: {resp.status_code} {resp.text}")
        tok = resp.json()
        self.access_token = tok["access_token"]
        self.refresh_token = tok.get("refresh_token", self.refresh_token)
        if self.token_store:
            self.token_store.parent.mkdir(parents=True, exist_ok=True)
            self.token_store.write_text(json.dumps(tok, ensure_ascii=False), encoding="utf-8")

    # ---- 요청 -------------------------------------------------------
    def get(self, path: str, params: dict | None = None, _retry: bool = True,
            _429_retries: int = 4) -> dict:
        resp = self._http.get(path, params=params, headers=self._headers())
        # 429(레이트리밋): Retry-After(없으면 점증 백오프) 만큼 쉬고 재시도.
        if resp.status_code == 429 and _429_retries > 0:
            import time
            ra = resp.headers.get("Retry-After")
            try:
                delay = float(ra) if ra else (5 - _429_retries) * 0.5 + 0.5
            except (TypeError, ValueError):
                delay = 1.0
            time.sleep(min(max(delay, 0.5), 5.0))
            return self.get(path, params, _retry=_retry, _429_retries=_429_retries - 1)
        if resp.status_code == 401 and _retry and self.refresh_token:
            self._refresh()
            return self.get(path, params, _retry=False, _429_retries=_429_retries)
        if resp.status_code >= 400:
            # 카페24 에러 본문(원인 메시지)을 예외에 실어 로그에서 바로 보이게 한다.
            raise httpx.HTTPStatusError(
                f"{resp.status_code} for {path} :: {resp.text[:600]}",
                request=resp.request,
                response=resp,
            )
        return resp.json()

    def iter_pages(self, path: str, params: dict, key: str, limit: int = PAGE_LIMIT):
        offset = 0
        while True:
            page = dict(params, limit=limit, offset=offset)
            data = self.get(path, page)
            items = data.get(key, []) or []
            yield from items
            if len(items) < limit:
                return
            offset += limit
            if offset > OFFSET_SAFETY:
                return

    # ---- 엔드포인트 -------------------------------------------------
    def list_orders(self, start_date: str, end_date: str, limit: int = PAGE_LIMIT,
                    embed: str | None = "items") -> list[dict]:
        # embed=items → 주문에 품목(베스트상품/카테고리 집계용)을 포함해 받는다.
        params = {"start_date": start_date, "end_date": end_date, "date_type": "order_date"}
        if embed:
            params["embed"] = embed
        return list(self.iter_pages("/api/v2/admin/orders", params, "orders", limit=limit))

    def count_orders(self, start_date: str, end_date: str) -> int:
        data = self.get(
            "/api/v2/admin/orders/count",
            {"start_date": start_date, "end_date": end_date, "date_type": "order_date"},
        )
        return int(data.get("count", 0) or 0)

    def list_boards(self) -> list[dict]:
        """게시판 목록. 실패 시 빈 리스트."""
        try:
            data = self.get("/api/v2/admin/boards", {})
            return data.get("boards", []) or []
        except httpx.HTTPStatusError:
            return []

    # 후기 게시판 번호는 몰마다 다르므로 1회 탐지해 캐시한다.
    _review_board_no: int | None = None
    _review_board_resolved = False

    def review_board_no(self) -> int | None:
        """후기 게시판 board_no 를 결정한다.

        우선순위: CAFE24_REVIEW_BOARD_NO 환경변수 → 게시판 목록에서 이름에
        '후기/review/리뷰' 포함 → 기본 4(상품 사용후기). 1회 탐지 후 캐시.
        """
        if Cafe24Client._review_board_resolved:
            return Cafe24Client._review_board_no
        env = os.environ.get("CAFE24_REVIEW_BOARD_NO")
        if env:
            try:
                Cafe24Client._review_board_no = int(env)
                Cafe24Client._review_board_resolved = True
                return Cafe24Client._review_board_no
            except ValueError:
                pass
        bno = None
        for b in self.list_boards():
            name = str(b.get("board_name") or b.get("name") or "")
            if any(k in name.lower() for k in ("후기", "review", "리뷰")):
                try:
                    bno = int(b.get("board_no"))
                    break
                except (TypeError, ValueError):
                    continue
        Cafe24Client._review_board_no = bno if bno is not None else 4
        Cafe24Client._review_board_resolved = True
        return Cafe24Client._review_board_no

    def count_reviews(self, start_date: str, end_date: str, board_no: int | None = None) -> int | None:
        """기간 내 상품후기 수(게시판 글). 실패 시 None.

        board_no 미지정 시 후기 게시판을 자동 탐지(review_board_no).
        /articles/count 가 없으면 /articles 목록을 기간 필터로 세는 폴백을 쓴다.
        """
        bno = board_no if board_no is not None else self.review_board_no()
        if bno is None:
            return None
        try:
            data = self.get(
                f"/api/v2/admin/boards/{bno}/articles/count",
                {"start_date": start_date, "end_date": end_date},
            )
            return int(data.get("count", 0) or 0)
        except httpx.HTTPStatusError:
            pass
        # 폴백: 목록을 기간 필터로 받아 건수를 센다(count 엔드포인트 부재 대응).
        try:
            rows = list(self.iter_pages(
                f"/api/v2/admin/boards/{bno}/articles",
                {"start_date": start_date, "end_date": end_date},
                "articles", limit=100,
            ))
            return len(rows)
        except httpx.HTTPStatusError:
            return None

    def list_categories(self) -> list[dict]:
        return list(self.iter_pages("/api/v2/admin/categories", {}, "categories", limit=100))

    def list_category_product_nos(self, category_no: int) -> list[int]:
        # /categories/{no}/products 는 422(detail category 전용) → /products?category=N 사용.
        rows = self.iter_pages(
            "/api/v2/admin/products", {"category": category_no}, "products", limit=100)
        out = []
        for r in rows:
            pno = r.get("product_no")
            if pno is not None:
                try:
                    out.append(int(pno))
                except (TypeError, ValueError):
                    pass
        return out

    def count_soldout(self) -> int | None:
        """현재 품절(sold_out=T) 상품 수. 실패 시 None."""
        try:
            data = self.get("/api/v2/admin/products/count", {"sold_out": "T"})
            return int(data.get("count", 0) or 0)
        except httpx.HTTPStatusError:
            return None

    # 몰/토큰권한에 따라 신규고객 엔드포인트가 아예 없을 수 있다. 그 경우에만 프로세스
    # 내에서 더 호출하지 않아(백필 시 매일 404/403 반복 방지) 속도를 아낀다.
    _new_customers_unavailable = False
    # latch 원인 진단용(운영 로그에서 403/404 등 실제 사유를 바로 보기 위함).
    _new_customers_last_error: str | None = None

    @staticmethod
    def _is_structural_http_error(exc: httpx.HTTPStatusError) -> bool:
        """재시도해도 소용없는 영구적 상태인가.

        403(scope 부족)·404/405(경로없음)·501(미구현)은 몰/토큰 설정이 바뀌기
        전까지 계속 실패 → 이후 호출을 생략한다. 반면 429/5xx/네트워크 오류는
        일시적이므로 latch 하지 않는다(그 날짜만 None, 다음 날짜는 정상 재시도).
        """
        resp = getattr(exc, "response", None)
        code = resp.status_code if resp is not None else 0
        return code in (403, 404, 405, 501)

    def count_new_customers(self, start_date: str, end_date: str) -> int | None:
        """기간 내 신규 가입 회원수.

        /customers/count(404 가능) → 목록(/customers) 폴백. 둘 다 실패하면 None.
        구조적 실패(권한/경로없음)일 때만 이후 호출을 생략하고, 일시적 오류
        (429/5xx)는 해당 날짜만 None 이며 다음 날짜에서 다시 시도한다.
        """
        if Cafe24Client._new_customers_unavailable:
            return None
        try:
            data = self.get(
                "/api/v2/admin/customers/count",
                {"created_start_date": start_date, "created_end_date": end_date},
            )
            return int(data.get("count", 0) or 0)
        except httpx.HTTPStatusError:
            pass
        # 폴백: 목록을 기간 필터로 받아 건수를 센다.
        try:
            rows = list(self.iter_pages(
                "/api/v2/admin/customers",
                {"created_start_date": start_date, "created_end_date": end_date},
                "customers",
            ))
            return len(rows)
        except httpx.HTTPStatusError as exc:
            # 권한부족/경로없음일 때만 영구 비활성화. 일시적 오류는 다음 날짜 재시도.
            if Cafe24Client._is_structural_http_error(exc):
                Cafe24Client._new_customers_unavailable = True
                Cafe24Client._new_customers_last_error = str(exc)[:300]
            return None

    def get_visitor_count(self, date: str) -> int | None:
        """일자 방문자수.

        카페24 방문/통계 엔드포인트는 몰·플랜·버전에 따라 경로/필드가 달라서,
        잘못된 URL 을 호출하지 않도록 기본값은 비활성(None)이다.
        CAFE24_VISITORS_PATH 환경변수로 경로를 지정하면 활성화된다.
        응답에서 count/visit_count/visitors/unique_visitors 중 하나를 읽는다.
        """
        path = os.environ.get("CAFE24_VISITORS_PATH")
        if not path:
            return None
        try:
            data = self.get(path, {"start_date": date, "end_date": date})
        except httpx.HTTPStatusError:
            return None
        if isinstance(data, dict):
            for k in ("count", "visit_count", "visitors", "unique_visitors"):
                v = data.get(k)
                if v is not None:
                    try:
                        return int(v)
                    except (TypeError, ValueError):
                        return None
        return None

    def close(self) -> None:
        self._http.close()
