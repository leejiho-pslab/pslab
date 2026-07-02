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

from cafe24_ops.alerts import build_alerts, build_digest  # noqa: E402
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

    digest = build_digest(store, date)
    alerts = build_alerts(store, date)
    store.close()

    print(f"== 일일 브리핑 ({date}) ==")
    for line in digest:
        print(" ", line)
    if not digest:
        print("  (요약 데이터 없음)")

    alert_lines = [f"{ICON.get(a['level'], '•')} {a['message']}" for a in alerts]
    if alert_lines:
        print("  -- 알림 --")
        for line in alert_lines:
            print(" ", line)
    else:
        print("  특이사항 없음")

    # Slack: 브리핑 + 알림을 한 메시지로
    body = "\n".join(digest)
    if alert_lines:
        body += "\n\n*알림*\n" + "\n".join(alert_lines)
    brand = cfg.shop.get("brand", "운영")
    if body and push_slack(f"*{brand} 일일 브리핑 ({date})*\n" + body):
        print("\n  → Slack 전송 완료")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
