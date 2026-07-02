#!/usr/bin/env python3
"""GA4 연결 진단 — 토큰 발급/권한/데이터 유무를 그대로 출력(오류 미은폐)."""
from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.clients.ga4 import GA4Client  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402

load_secrets()


def main() -> int:
    c = GA4Client.from_env()
    if not c:
        print("GA4 미설정 — GA4_PROPERTY_ID / GOOGLE_APPLICATION_CREDENTIALS_JSON 시크릿 확인")
        return 0
    print(f"property_id = {c.property_id}")
    # 1) 토큰 발급
    try:
        tok = c._access_token()
        print(f"토큰 발급 OK (len={len(tok)})")
    except Exception as e:  # noqa: BLE001
        print(f"토큰 발급 ERROR: {type(e).__name__}: {str(e)[:400]}")
        return 0
    # 2) 최근 8일 일자별 방문자 raw 응답
    body = {
        "dateRanges": [{"startDate": "8daysAgo", "endDate": "yesterday"}],
        "dimensions": [{"name": "date"}],
        "metrics": [{"name": "totalUsers"}, {"name": "sessions"}],
    }
    path = f"/v1beta/properties/{c.property_id}:runReport"
    resp = c._http.post(path, headers={"Authorization": f"Bearer {tok}"}, json=body)
    print(f"runReport status = {resp.status_code}")
    print("body:", resp.text[:1500])

    # 3) 최근 8일 이벤트명 × 건수 — 회원가입(sign_up 등) 이벤트가 실제 잡히는지 확인.
    #    카페24 신규가입수를 카페24 API 대신 GA4 이벤트로 낼 수 있는지 판단하는 용도.
    ev_body = {
        "dateRanges": [{"startDate": "8daysAgo", "endDate": "yesterday"}],
        "dimensions": [{"name": "eventName"}],
        "metrics": [{"name": "eventCount"}],
        "orderBys": [{"metric": {"metricName": "eventCount"}, "desc": True}],
        "limit": 50,
    }
    resp2 = c._http.post(path, headers={"Authorization": f"Bearer {tok}"}, json=ev_body)
    print(f"\n이벤트명별 건수 status = {resp2.status_code}")
    print("body:", resp2.text[:3000])
    c.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
