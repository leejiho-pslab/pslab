#!/usr/bin/env python3
"""카페24 live 1일 수집 스모크 테스트.

config/secrets.env 의 자격증명으로 카페24 Admin API 를 호출해 하루치 데이터를
수집한다. 자격증명 → 연결 → 수집 순으로 단계 점검한다.

사용법:
    python scripts/smoke_live.py --check             # 자격증명/연결만 (쓰기 없음)
    python scripts/smoke_live.py --date 2026-06-17   # 1일 수집 + 저장 + 요약
    python scripts/smoke_live.py                     # 어제 날짜로 수집
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.pipeline import run_pipeline, yesterday  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

REQUIRED = ["CAFE24_MALL_ID", "CAFE24_ACCESS_TOKEN"]
RECOMMENDED = ["CAFE24_REFRESH_TOKEN", "CAFE24_CLIENT_ID", "CAFE24_CLIENT_SECRET"]


def check_credentials() -> bool:
    load_secrets()
    print("== ① 자격증명 점검 ==")
    for k in REQUIRED:
        print(f"  [{'OK ' if os.environ.get(k) else '없음'}] {k} (필수)")
    for k in RECOMMENDED:
        print(f"  [{'OK ' if os.environ.get(k) else '권장'}] {k}")
    missing = [k for k in REQUIRED if not os.environ.get(k)]
    if missing:
        print(f"\n  ✗ 필수 누락: {', '.join(missing)}")
        print("  → cp config/secrets.env.example config/secrets.env 후 값을 채우세요.")
        return False
    if not all(os.environ.get(k) for k in RECOMMENDED):
        print("\n  ⚠ refresh_token/client_id/secret 이 없으면 access_token 만료(2시간) 시 "
              "자동 갱신이 안 됩니다.")
    return True


def check_connectivity(date: str) -> bool:
    from cafe24_ops.clients import Cafe24Client

    cfg = load_config()
    client = Cafe24Client.from_config(cfg)
    print(f"\n== ② 연결 점검 (mall={client.mall_id}, date={date}) ==")
    try:
        n = client.count_orders(date, date)
        print(f"  [OK ] GET /api/v2/admin/orders/count → {n}건")
        return True
    except Exception as e:  # noqa: BLE001 - 스모크에서는 모든 오류를 진단으로 보여준다
        print(f"  [실패] {type(e).__name__}: {e}")
        print("  → 점검: 토큰 만료(401)·권한 scope(mall.read_order)·mall_id·API 버전")
        return False
    finally:
        client.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="카페24 live 수집 스모크")
    parser.add_argument("--date", help="수집 기준일 (YYYY-MM-DD). 기본: 어제")
    parser.add_argument("--check", action="store_true", help="점검만 하고 수집/저장은 하지 않음")
    args = parser.parse_args(argv)
    date = args.date or yesterday()

    logging.basicConfig(level=logging.INFO, format="%(message)s")

    if not check_credentials():
        return 2
    if not check_connectivity(date):
        return 3
    if args.check:
        print("\n✓ 점검 완료 (쓰기 없음). 실제 수집은 --check 없이 실행하세요.")
        return 0

    os.environ["CAFE24_OPS_MODE"] = "live"
    cfg = load_config()
    store = Store(cfg.data_dir)
    print(f"\n== ③ live 수집 (date={date}) ==")
    result = run_pipeline(date, cfg, store, mode="live")
    print("\n  수집 KPI:")
    for k, v in result.kpi.items():
        print(f"    {k:<16} {v}")
    if not result.kpi:
        print("    (없음 — 해당일 주문이 0이거나 매핑 확인 필요)")
    print(f"\n  저장: {store.db_path}")
    print("  대시보드 확인: uvicorn api.main:app --reload  →  dashboard 에서 해당 날짜 선택")
    store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
