#!/usr/bin/env python3
"""카페24 OAuth 토큰 발급 헬퍼.

카페24 Admin API 는 OAuth2 'authorization_code' 방식이라 한 번은 브라우저로
인가(authorize)를 받아 코드를 받고, 그 코드를 access/refresh 토큰으로 교환해야 한다.
이 스크립트가 그 두 단계를 도와준다. (CLIENT_ID/SECRET/MALL_ID 는 secrets.env 에서 읽음)

1) 인가 URL 만들기 — 브라우저에서 열어 '승인' → 주소창의 code= 값 복사
   python scripts/cafe24_auth.py --authorize --redirect-uri https://localhost

2) 코드 → 토큰 교환 (자동으로 토큰 저장 + secrets.env 에 넣을 줄 출력)
   python scripts/cafe24_auth.py --code <복사한코드> --redirect-uri https://localhost
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402

DEFAULT_SCOPE = "mall.read_order,mall.read_customer"


def _env(key: str) -> str:
    v = os.environ.get(key, "")
    if not v:
        print(f"  ✗ {key} 없음 — config/secrets.env 에 먼저 채우세요.")
        raise SystemExit(2)
    return v


def authorize_url(mall_id: str, client_id: str, redirect_uri: str, scope: str, state: str) -> str:
    from urllib.parse import urlencode

    q = urlencode({
        "response_type": "code",
        "client_id": client_id,
        "state": state,
        "redirect_uri": redirect_uri,
        "scope": scope,
    })
    return f"https://{mall_id}.cafe24api.com/api/v2/oauth/authorize?{q}"


def exchange(mall_id: str, client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    resp = httpx.post(
        f"https://{mall_id}.cafe24api.com/api/v2/oauth/token",
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
        timeout=30.0,
    )
    if resp.status_code != 200:
        print(f"  ✗ 토큰 교환 실패: {resp.status_code} {resp.text}")
        print("  → 점검: code 만료(발급 후 1분 내 사용)·redirect_uri 일치·client_id/secret·scope")
        raise SystemExit(3)
    return resp.json()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="카페24 OAuth 토큰 발급")
    p.add_argument("--authorize", action="store_true", help="인가 URL 출력")
    p.add_argument("--code", help="인가 후 받은 code 값")
    p.add_argument("--redirect-uri", default="https://localhost", help="앱에 등록한 Redirect URI")
    p.add_argument("--scope", default=DEFAULT_SCOPE, help=f"권한 scope (기본: {DEFAULT_SCOPE})")
    p.add_argument("--state", default="cafe24-ops", help="state 값")
    p.add_argument("--to-db", action="store_true",
                   help="발급 토큰을 DATABASE_URL 의 app_kv 에 영속화(무인 수집용)")
    args = p.parse_args(argv)

    load_secrets()
    cfg = load_config()
    mall_id = os.environ.get("CAFE24_MALL_ID") or cfg.sources.shop.get("mall_id", "")
    if not mall_id:
        print("  ✗ CAFE24_MALL_ID 없음 (secrets.env 또는 sources.yaml shop.mall_id)")
        return 2
    client_id = _env("CAFE24_CLIENT_ID")

    if args.authorize:
        url = authorize_url(mall_id, client_id, args.redirect_uri, args.scope, args.state)
        print("== ① 인가 URL — 브라우저에서 열고 '승인' 후 주소창 code= 값을 복사 ==\n")
        print(url)
        print("\n승인하면 다음처럼 리다이렉트됩니다:")
        print(f"  {args.redirect_uri}?code=XXXXXXXX&state={args.state}")
        print("\n그 XXXXXXXX 를 복사해서:")
        print(f"  python scripts/cafe24_auth.py --code XXXXXXXX --redirect-uri {args.redirect_uri}")
        return 0

    if not args.code:
        print("  사용법: --authorize 로 URL 받기 → 승인 → --code <코드> 로 교환")
        return 1

    client_secret = _env("CAFE24_CLIENT_SECRET")
    tok = exchange(mall_id, client_id, client_secret, args.code, args.redirect_uri)

    # 토큰 저장소(클라이언트가 자동으로 읽음) 에 기록
    store_path = cfg.data_dir / "cafe24_token.json"
    store_path.parent.mkdir(parents=True, exist_ok=True)
    store_path.write_text(json.dumps(tok, ensure_ascii=False, indent=2), encoding="utf-8")

    # --to-db: DATABASE_URL(예: Postgres) 의 app_kv 에 영속화 → GitHub Actions 무인 수집이 이어받음
    if args.to_db:
        from cafe24_ops.store import Store

        s = Store(cfg.data_dir)
        try:
            s.set_kv("cafe24_access_token", tok.get("access_token", ""))
            s.set_kv("cafe24_refresh_token", tok.get("refresh_token", ""))
        finally:
            s.close()
        print(f"  DB 영속화: {s.db_path} (app_kv)")

    print("== ② 토큰 발급 완료 ==")
    print(f"  저장: {store_path} (수집 시 자동 사용)")
    print(f"  access_token  만료: {tok.get('expires_at', '약 2시간')}")
    print(f"  refresh_token 만료: {tok.get('refresh_token_expires_at', '약 2주')}")
    print("\nsecrets.env 에도 넣어두면 안전합니다(아래 줄 복사):\n")
    print(f"CAFE24_ACCESS_TOKEN={tok.get('access_token','')}")
    print(f"CAFE24_REFRESH_TOKEN={tok.get('refresh_token','')}")
    print("\n다음: python scripts/smoke_live.py --check")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
