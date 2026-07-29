#!/usr/bin/env python3
"""카페24 접속통계/Analytics API 가용성 진단 — 구매·고객 퍼널 데이터를 쓸 수 있는지 확인.

배경:
  카페24는 Admin API(주문/상품/회원) 외에 **통계(Analytics) API** 를 별도 호스트
  (ca-api.cafe24data.com)로 제공한다. 방문자·유입경로·장바구니·페이지·광고효과 등
  "관리자 > 통계" 화면의 데이터가 여기 있다. 다만 공식 문서상 승인 제휴사 대상이라
  일반 몰 토큰으로 열리는지는 **직접 쏴봐야만** 알 수 있다.

이 스크립트가 하는 일:
  1) Admin API 로 토큰이 살아있는지 확인(필요 시 자동 갱신)
  2) Analytics 호스트의 후보 엔드포인트를 최소 요청으로 전수 probe
  3) Admin API 쪽 통계 후보 경로도 함께 probe
  각 결과의 HTTP 상태와 응답 앞부분을 **그대로** 출력한다(오류 미은폐).

읽는 법:
  200        → 사용 가능. 응답 필드를 보고 수집기로 붙이면 된다.
  401/403    → 토큰 스코프 부족 또는 제휴사 승인 필요(앱 권한에 통계 읽기 추가 필요)
  404        → 그 경로는 존재하지 않음(경로 후보에서 제외)
  422        → 경로는 있으나 파라미터가 다름(파라미터만 맞추면 됨)
"""
from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from cafe24_ops.clients.cafe24_client import Cafe24Client  # noqa: E402
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402

load_secrets()

ANALYTICS_HOST = "https://ca-api.cafe24data.com"

# 구매·고객 퍼널과 직접 관련된 것부터. (문서 카탈로그: Adeffect/Carts/Members sales/
# Pages/Products/Sales/Visitors/Visitpaths)
ANALYTICS_PATHS = [
    # 방문 → 사이트에 몇 명이 왔나
    ("방문자 요약", "/visitors/view"),
    ("방문자 신규/재방문", "/visitors/new"),
    ("방문자 시간대", "/visitors/hour"),
    # 유입 경로 → 어디서 왔나 (GA4 와 교차검증 가능)
    ("유입 경로 요약", "/visitpaths/view"),
    ("유입 도메인", "/visitpaths/domains"),
    ("유입 검색어", "/visitpaths/keywords"),
    # 페이지 → 어디를 봤나
    ("페이지뷰", "/pages/view"),
    # 장바구니 → 담고 안 산 사람 (퍼널의 핵심 구간)
    ("장바구니 요약", "/carts/view"),
    ("장바구니 상품", "/carts/products"),
    # 상품/매출 → 무엇을 샀나
    ("상품 통계", "/products/view"),
    ("상품별 구매", "/products/buy"),
    ("매출 통계", "/sales/view"),
    ("결제수단별", "/sales/payments"),
    # 회원 → 누가 샀나
    ("회원/비회원 매출", "/memberssales/view"),
    ("회원 통계", "/members/view"),
    # 광고효과
    ("광고효과", "/adeffect/view"),
]

# Admin API 쪽 "접속통계" 후보. 문서에 없지만 몰/버전에 따라 열려 있을 수 있어 확인.
ADMIN_PATHS = [
    ("주문 카운트(대조군)", "/api/v2/admin/orders/count"),
    ("방문자 통계", "/api/v2/admin/reports/visitors"),
    ("접속 통계", "/api/v2/admin/statistics/visitors"),
    ("장바구니", "/api/v2/admin/carts"),
    ("장바구니 카운트", "/api/v2/admin/carts/count"),
]


def _dates() -> tuple[str, str]:
    end = date.today() - timedelta(days=1)
    return (end - timedelta(days=6)).isoformat(), end.isoformat()


def _show(label: str, resp: httpx.Response | None, err: str = "") -> None:
    if resp is None:
        print(f"  ⚠️  {label:18s} 요청 실패 — {err}")
        return
    body = resp.text.replace("\n", " ")[:260]
    mark = "✅" if resp.status_code == 200 else "❌"
    print(f"  {mark} {label:18s} HTTP {resp.status_code} — {body}")


def main() -> int:
    cfg = load_config()
    # 수집기와 동일하게 DB 영속 토큰을 최우선 사용(무인 환경에서 토큰이 회전되므로
    # 시크릿의 값은 이미 낡았을 수 있다). 없으면 env 폴백.
    from cafe24_ops.store import Store  # noqa: PLC0415

    kv = Store(cfg.data_dir)
    try:
        client = Cafe24Client.from_config(
            cfg,
            access_override=kv.get_kv("cafe24_access_token"),
            refresh_override=kv.get_kv("cafe24_refresh_token"),
        )
    finally:
        kv.close()
    start, end = _dates()
    print(f"mall_id = {client.mall_id} / 조회기간 {start} ~ {end}")

    # 1) 토큰 살아있는지 (만료면 여기서 자동 갱신됨)
    try:
        client.get("/api/v2/admin/orders/count", {"start_date": start, "end_date": end})
        print("Admin API 토큰 OK (필요 시 자동 갱신 완료)")
    except httpx.HTTPStatusError as exc:
        print(f"Admin API 토큰 확인 실패: {str(exc)[:300]}")
        return 0

    # 2) Analytics 호스트 probe — 경로 접두어 두 가지를 모두 시도
    print("\n===== 카페24 Analytics API (ca-api.cafe24data.com) =====")
    params = {
        "mall_id": client.mall_id,
        "shop_no": 1,
        "start_date": start,
        "end_date": end,
        "format": "json",
    }
    headers = {
        "Authorization": f"Bearer {client.access_token}",
        "Content-Type": "application/json",
    }
    with httpx.Client(base_url=ANALYTICS_HOST, timeout=30.0) as http:
        # 접두어 결정: 첫 후보로 /api/v2 유무를 한 번만 판별한다(불필요한 왕복 방지)
        prefix = ""
        for cand in ("/api/v2", ""):
            try:
                r = http.get(f"{cand}/visitors/view", params=params, headers=headers)
            except httpx.HTTPError as exc:  # noqa: PERF203
                print(f"  ⚠️  접두어 {cand or '(없음)'} 연결 실패 — {type(exc).__name__}: {exc}")
                continue
            print(f"  · 접두어 {cand or '(없음)'} → HTTP {r.status_code}")
            if r.status_code != 404:
                prefix = cand
                break
        for label, path in ANALYTICS_PATHS:
            try:
                r = http.get(f"{prefix}{path}", params=params, headers=headers)
            except httpx.HTTPError as exc:
                _show(label, None, f"{type(exc).__name__}: {exc}")
                continue
            _show(label, r)

    # 3) Admin API 쪽 통계 후보
    print("\n===== Admin API 통계 후보 경로 =====")
    for label, path in ADMIN_PATHS:
        try:
            client.get(path, {"start_date": start, "end_date": end})
            print(f"  ✅ {label:18s} HTTP 200 — 사용 가능")
        except httpx.HTTPStatusError as exc:
            print(f"  ❌ {label:18s} {str(exc)[:260]}")
        except httpx.HTTPError as exc:
            print(f"  ⚠️  {label:18s} {type(exc).__name__}: {exc}")

    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
