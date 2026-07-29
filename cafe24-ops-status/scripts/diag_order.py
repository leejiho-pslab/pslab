#!/usr/bin/env python3
"""카페24 주문 스키마 진단 — 신규/재구매·디바이스·베스트/카테고리 구현 전 실데이터 필드 확인.

DB(app_kv)의 카페24 토큰으로 최근 주문 1페이지를 받아, 주문 객체에 어떤 키가 있는지
(회원/디바이스/품목 등) 출력한다. 토큰을 회전시키지 않도록 읽기만 한다.

사용: Actions(또는 로컬, DATABASE_URL/CAFE24_* 환경)에서
    python scripts/diag_order.py --date 2026-06-25
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.clients import Cafe24Client  # noqa: E402
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--date", required=True, help="주문이 있는 날짜 YYYY-MM-DD")
    args = p.parse_args(argv)

    config = load_config()
    kv = Store(config.data_dir)
    client = Cafe24Client.from_store(config, kv)
    try:
        orders = client.list_orders(args.date, args.date)
        print(f"== 주문 {len(orders)}건 ({args.date}) ==")
        if not orders:
            print("주문이 없습니다. 주문 있는 날짜로 --date 지정하세요.")
            return 0
        o = orders[0]
        print("\n[전체 키]")
        print(sorted(o.keys()))
        # 신규/재구매·디바이스 후보 필드 탐색
        cand = ["member_id", "member_email", "member_authentication", "membership_group_no",
                "first_order", "device", "device_type", "channel", "inflow_path", "store_id",
                "buyer_name", "order_from_mobile", "payment_method", "order_place_name"]
        print("\n[후보 필드 값]")
        for k in cand:
            if k in o:
                print(f"  {k}: {o[k]!r}")
        print("\n[첫 주문 원본(앞 1500자)]")
        print(json.dumps(o, ensure_ascii=False)[:1500])
    finally:
        client.close()
        kv.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
