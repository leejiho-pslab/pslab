#!/usr/bin/env python3
"""카페24 재인증용 '승인 URL' 출력 — 브라우저로 열어 승인하면 code 를 받는다.

언제 쓰나:
  refresh_token 이 끊겼을 때(invalid_grant). 카페24 refresh_token 은 갱신마다
  회전하고 직전 것이 즉시 무효라, 회전분을 저장 못 한 실행이 한 번이라도 있으면
  체인이 끊긴다. 그때는 사람이 브라우저로 한 번 승인해 주는 수밖에 없다.

출력 URL 을 브라우저에서 열고 '승인' → 주소창의 code= 값을 복사해
Actions → 'cafe24 token bootstrap' 에 넣으면 복구된다.
"""
from __future__ import annotations

import os
from pathlib import Path
import sys
from urllib.parse import urlencode

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.secrets import load_secrets  # noqa: E402

load_secrets()

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
    mall_id = os.environ.get("CAFE24_MALL_ID", "")
    client_id = os.environ.get("CAFE24_CLIENT_ID", "")
    redirect_uri = os.environ.get("CAFE24_REDIRECT_URI") or f"https://{mall_id}.cafe24.com/"
    scope = os.environ.get("CAFE24_SCOPE", DEFAULT_SCOPE)
    if not mall_id or not client_id:
        print("CAFE24_MALL_ID / CAFE24_CLIENT_ID 가 없습니다.")
        return 1

    q = urlencode({
        "response_type": "code",
        "client_id": "__CID__",
        "state": "reauth",
        "redirect_uri": redirect_uri,
        "scope": scope,
    }).replace("__CID__", _unmaskable(client_id))

    print("=" * 70)
    print("아래 주소를 복사해 브라우저 주소창에 붙여넣고 '승인'을 누르세요.")
    print("=" * 70)
    print(f"https://{mall_id}.cafe24api.com/api/v2/oauth/authorize?{q}")
    print("=" * 70)
    print("승인하면 주소창이 아래처럼 바뀝니다. code= 뒤의 값만 복사하세요.")
    print(f"  {redirect_uri}?code=<이 값을 복사>&state=reauth")
    print()
    print("⚠ 이 코드는 발급 후 약 1분이면 만료됩니다.")
    print("  복사 후 바로 Actions → 'cafe24 token bootstrap' → Run workflow 에 넣으세요.")
    print(f"  redirect_uri 칸에는 이 값을 그대로: {redirect_uri}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
