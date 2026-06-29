#!/usr/bin/env python3
"""확장 권한 토큰으로 cafe24 엔드포인트들을 점검 — 응답 구조 파악용(1회성).

빈 대시보드 패널(방문자/베스트상품/카테고리/후기/장바구니)을 정확히 구현하기 위해,
각 엔드포인트의 상태코드 + 최상위 키 + 첫 항목 키를 출력한다.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.clients import Cafe24Client  # noqa: E402
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()

TODAY = "2026-06-23"  # 주문이 있는 날(품목 구조 확인용)
_DR = {"start_date": TODAY, "end_date": TODAY}
PROBES = [
    ("orders+items(embed)", "/api/v2/admin/orders",
     {**_DR, "date_type": "order_date", "limit": 1, "embed": "items"}),
    ("products", "/api/v2/admin/products", {"limit": 1}),
    # 접속통계(Analytics) 방문자 후보 경로 — 광범위 탐색
    ("reports/visitors", "/api/v2/admin/reports/visitors", _DR),
    ("reports/visit", "/api/v2/admin/reports/visit", _DR),
    ("reports/dailyvisitors", "/api/v2/admin/reports/dailyvisitors", _DR),
    ("reports/pageview", "/api/v2/admin/reports/pageview", _DR),
    ("reports/pageviews", "/api/v2/admin/reports/pageviews", _DR),
    ("reports/visitsummary", "/api/v2/admin/reports/visitsummary", _DR),
    ("reports/accesslog", "/api/v2/admin/reports/accesslog", _DR),
    ("statistics/visitors", "/api/v2/admin/statistics/visitors", _DR),
    ("statistics/summary", "/api/v2/admin/statistics/summary", _DR),
    ("visitors", "/api/v2/admin/visitors", _DR),
    ("reports", "/api/v2/admin/reports", {}),
    # 후기 게시판 글 수(상품후기=board_no 4 가 일반적)
    ("board4/articles", "/api/v2/admin/boards/4/articles",
     {"start_date": TODAY, "end_date": TODAY, "limit": 1}),
]


def shape(v):
    if isinstance(v, dict):
        return {k: shape(val) for k, val in list(v.items())[:1]} if False else list(v.keys())
    if isinstance(v, list):
        return [shape(v[0])] if v else []
    return type(v).__name__


def main() -> int:
    config = load_config()
    kv = Store(config.data_dir)
    access = kv.get_kv("cafe24_access_token")
    refresh = kv.get_kv("cafe24_refresh_token")
    client = Cafe24Client.from_config(config, access_override=access, refresh_override=refresh)
    for name, path, params in PROBES:
        try:
            data = client.get(path, params)
            top = list(data.keys()) if isinstance(data, dict) else type(data).__name__
            first_keys = None
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, list) and v and isinstance(v[0], dict):
                        first_keys = (k, list(v[0].keys()))
                        break
            print(f"\n=== {name} :: 200 ===")
            print("  top:", top)
            if first_keys:
                print(f"  {first_keys[0]}[0] keys:", first_keys[1])
            else:
                print("  sample:", json.dumps(data, ensure_ascii=False)[:400])
            # 주문 품목 키, 상품 품절 필드는 따로 자세히
            if name.startswith("orders") and isinstance(data, dict):
                its = (data.get("orders") or [{}])[0].get("items") or []
                if its:
                    print("  items[0] keys:", list(its[0].keys()))
                    print("  items[0] sample:", json.dumps(its[0], ensure_ascii=False)[:500])
            if name == "products" and isinstance(data, dict):
                p = (data.get("products") or [{}])[0]
                print("  product sold_out/selling/display:",
                      p.get("sold_out"), p.get("selling"), p.get("display"))
        except Exception as e:
            msg = str(e)[:200]
            print(f"\n=== {name} :: ERROR ===\n  {type(e).__name__}: {msg}")
    client.close()
    kv.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
