#!/usr/bin/env python3
"""카페24 재인증용 '승인 URL' 출력 — 브라우저로 열어 승인하면 code 를 받는다.

언제 쓰나:
  refresh_token 이 끊겼을 때(invalid_grant). 카페24 refresh_token 은 갱신마다
  회전하고 직전 것이 즉시 무효라, 회전분을 저장 못 한 실행이 한 번이라도 있으면
  체인이 끊긴다. 그때는 사람이 브라우저로 한 번 승인해 주는 수밖에 없다.

출력 URL 을 브라우저에서 열고 '승인' → 주소창의 code= 값을 복사해
Actions → 'cafe24 token bootstrap' 에 넣으면 복구된다.

⚠ 의존성 없이 표준 라이브러리만 쓴다(pip install 생략 → 실행이 몇 초 안에 끝남).
  인가코드는 1분이면 만료되므로 복구 경로는 빠를수록 좋다.
"""
from __future__ import annotations

import os
import sys
from urllib.parse import urlencode

DEFAULT_SCOPE = "mall.read_order,mall.read_customer"


def _unmaskable(secret: str) -> str:
    """GitHub Actions 로그 마스킹을 피하려고 첫 글자만 퍼센트 인코딩한다.

    client_id 는 어차피 브라우저 주소창에 그대로 노출되는 공개 값인데,
    Actions 는 시크릿과 **완전히 같은 문자열**을 *** 로 가려버려서 URL 이 못 쓰게 된다.
    한 글자를 %XX 로 바꾸면 문자열이 달라져 마스킹을 피하고, 브라우저는 디코딩해
    원래 값으로 요청하므로 동작은 동일하다. (client_secret 은 절대 출력하지 않는다)
    """
    return f"%{ord(secret[0]):02X}{secret[1:]}" if secret else secret


def main() -> int:
    # mall_id 는 시크릿이 아니라 **입력값**에서 받는다.
    # 호스트명(https://<mall>.cafe24api.com)은 퍼센트 인코딩이 불가능해
    # 시크릿을 쓰면 *** 로 가려진 채 출력돼 URL 이 무용지물이 되기 때문.
    mall_id = os.environ.get("CAFE24_MALL_ID_INPUT", "").strip()
    client_id = os.environ.get("CAFE24_CLIENT_ID", "").strip()
    redirect_uri = os.environ.get("CAFE24_REDIRECT_URI", "").strip() \
        or f"https://{mall_id}.cafe24.com/"
    scope = os.environ.get("CAFE24_SCOPE", "").strip() or DEFAULT_SCOPE
    if not mall_id or not client_id:
        print("mall_id(입력값) 또는 CAFE24_CLIENT_ID(시크릿)가 비어 있습니다.", file=sys.stderr)
        return 1

    q = urlencode({
        "response_type": "code",
        "client_id": "__CID__",
        "state": "reauth",
        "redirect_uri": redirect_uri,
        "scope": scope,
    }).replace("__CID__", _unmaskable(client_id))

    print("=" * 72)
    print("① 아래 주소 한 줄을 통째로 복사해 브라우저 주소창에 붙여넣고 엔터")
    print("=" * 72)
    print(f"https://{mall_id}.cafe24api.com/api/v2/oauth/authorize?{q}")
    print("=" * 72)
    print("② 카페24 로그인 후 '승인'을 누르면 주소창이 아래처럼 바뀝니다.")
    print(f"   {redirect_uri}?code=<여기 값을 복사>&state=reauth")
    print()
    print("③ code= 뒤부터 & 앞까지만 복사 → Actions → 'cafe24 token bootstrap' 실행")
    print(f"   redirect_uri 칸에는 이 값을 그대로 넣으세요: {redirect_uri}")
    print()
    print("⚠ 코드는 발급 후 약 1분이면 만료됩니다. 복사했으면 바로 ③으로.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
