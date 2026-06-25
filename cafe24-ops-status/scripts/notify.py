#!/usr/bin/env python3
"""알림 생성 + (선택) Slack 푸시.

사용법:
    python scripts/notify.py --date 2026-06-17
    SLACK_WEBHOOK_URL=... python scripts/notify.py   # 설정 시 Slack 으로도 전송
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.alerts import build_alerts  # noqa: E402
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.pipeline import yesterday  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

ICON = {"warning": "🔴", "info": "🔵"}


def push_slack(text: str) -> bool:
    url = os.environ.get("SLACK_WEBHOOK_URL")
    if not url:
        return False
    import httpx

    try:
        r = httpx.post(url, json={"text": text}, timeout=10)
        return r.status_code < 300
    except Exception as e:  # noqa: BLE001
        print(f"  (Slack 전송 실패: {e})")
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="운영 알림 생성")
    parser.add_argument("--date", help="기준일 (YYYY-MM-DD). 기본: 어제")
    args = parser.parse_args(argv)

    load_secrets()
    cfg = load_config()
    store = Store(cfg.data_dir)
    date = args.date or (store.list_dates()[-1] if store.list_dates() else yesterday())

    alerts = build_alerts(store, date)
    store.close()

    print(f"== 알림 ({date}) ==")
    if not alerts:
        print("  특이사항 없음")
        return 0

    lines = []
    for a in alerts:
        line = f"{ICON.get(a['level'], '•')} {a['message']}"
        print(" ", line)
        lines.append(line)

    if push_slack(f"*keek 운영 알림 ({date})*\n" + "\n".join(lines)):
        print("\n  → Slack 전송 완료")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
