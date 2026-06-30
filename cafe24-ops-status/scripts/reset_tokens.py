#!/usr/bin/env python3
"""DB(app_kv)에 저장된 토큰 키를 삭제 — 보안 토큰 회전(재발급) 시 사용.

수집기는 DB에 영속된 토큰을 GitHub Secret(env)보다 우선 사용한다. 따라서 키를 재발급해
Secret 만 바꾸면 옛 DB 토큰이 계속 쓰여 실패한다. 이 스크립트로 DB의 옛 토큰을 비우면,
다음 실행이 새 Secret(또는 부트스트랩)으로 토큰을 다시 만들어 DB에 저장한다.

사용:
    python scripts/reset_tokens.py                 # meta + cafe24 토큰 키 삭제
    python scripts/reset_tokens.py --keys meta_access_token
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()

DEFAULT_KEYS = "meta_access_token,cafe24_access_token,cafe24_refresh_token"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="DB 토큰 키 삭제(토큰 회전용)")
    p.add_argument("--keys", default=DEFAULT_KEYS, help="삭제할 app_kv 키 콤마목록")
    args = p.parse_args(argv)

    keys = [k.strip() for k in args.keys.split(",") if k.strip()]
    config = load_config()
    store = Store(config.data_dir)
    try:
        for k in keys:
            n = store.delete_kv(k)
            print(f"  deleted '{k}': {n} row(s)")
    finally:
        store.close()
    print("RESET_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
