"""GA4 (Google Analytics Data API) 커넥터 — 방문자수 수집.

카페24 Admin API 에는 방문자 엔드포인트가 없어 구매전환율(=구매건수/방문자수)을
낼 수 없다. GA4 가 유일한 안정적 무인 경로다.

활성화(둘 다 필요, 없으면 자동 비활성):
  - GA4_PROPERTY_ID                     : GA4 속성 ID(숫자)
  - GOOGLE_APPLICATION_CREDENTIALS_JSON : 서비스계정 키 JSON 문자열(읽기 권한 부여)

응답 → 방문자수 매핑(ga4_report_to_visitors)은 순수함수로 단위테스트하고,
토큰 발급/HTTP 는 실제 자격증명으로만 동작한다(타 광고 커넥터와 동일 패턴).
참고: https://developers.google.com/analytics/devguides/reporting/data/v1
"""
from __future__ import annotations

import json
import os

import httpx

GA4_BASE = "https://analyticsdata.googleapis.com"
GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"


def ga4_report_to_visitors(raw: dict) -> int | None:
    """runReport 응답 → 방문자수(totalUsers). 행이 없으면 None(데이터 없음)."""
    rows = (raw or {}).get("rows") or []
    if not rows:
        return None
    vals = rows[0].get("metricValues") or []
    if not vals:
        return None
    try:
        return int(float(vals[0].get("value", 0) or 0))
    except (TypeError, ValueError):
        return None


def ga4_report_to_new_returning(raw: dict) -> dict | None:
    """newVsReturning 차원 runReport 응답 → {'new': n, 'returning': m}. 행 없으면 None.

    GA4 는 신규/재방문을 'new'/'returning'(또는 빈문자=미상)으로 준다. 미상은 신규로 합산.
    """
    rows = (raw or {}).get("rows") or []
    if not rows:
        return None
    out = {"new": 0, "returning": 0}
    for r in rows:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or [{}]
        seg = (dims[0].get("value") or "").lower()
        try:
            v = int(float(vals[0].get("value", 0) or 0))
        except (TypeError, ValueError):
            v = 0
        out["returning" if seg.startswith("return") else "new"] += v
    return out


# GA4 sessionSourceMedium("naver / cpc" 등) → 대시보드 광고 채널 키.
# 디브릭 실제 UTM 태깅 규칙에 맞춰 config/ga4_channel_map.yaml 로 재정의 가능(없으면 이 기본값 사용).
# 매칭 안 되는 source/medium 은 "ga4_unmapped" 로 남아 유실 없이 확인 가능하다.
DEFAULT_SOURCE_MEDIUM_CHANNEL = {
    "facebook / cpc": "meta",
    "instagram / cpc": "meta",
    "fb / cpc": "meta",
    "ig / cpc": "meta",
    "naver / cpc": "naver_powerlink",
    "naver_powerlink / cpc": "naver_powerlink",
    "naver_place / cpc": "naver_place",
    "naver_place / referral": "naver_place",
    "google / cpc": "google",
    "kakao / cpc": "kakao",
    "kakaomoment / cpc": "kakao",
}


def ga4_report_to_channel_conversions(raw: dict, mapping: dict | None = None) -> dict[str, dict]:
    """sessionSourceMedium 차원 runReport(conversions, purchaseRevenue) →
    {channel: {"conversions": n, "ga4_conversion_value": v}}.

    매핑 안 되는 source/medium 은 channel="ga4_unmapped" 로 합산돼 유실 없이 노출된다.
    """
    mapping = mapping or DEFAULT_SOURCE_MEDIUM_CHANNEL
    rows = (raw or {}).get("rows") or []
    out: dict[str, dict] = {}
    for r in rows:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        source_medium = (dims[0].get("value") or "").strip()
        channel = mapping.get(source_medium, "ga4_unmapped")
        conv = float(vals[0].get("value", 0) or 0) if len(vals) > 0 else 0.0
        rev = float(vals[1].get("value", 0) or 0) if len(vals) > 1 else 0.0
        agg = out.setdefault(channel, {"conversions": 0.0, "ga4_conversion_value": 0.0})
        agg["conversions"] += conv
        agg["ga4_conversion_value"] += rev
    return out


class GA4Client:
    def __init__(
        self,
        property_id: str,
        credentials_info: dict,
        transport: httpx.BaseTransport | None = None,
        base_url: str = GA4_BASE,
        timeout: float = 30.0,
        token_fn=None,
    ):
        self.property_id = str(property_id)
        self.credentials_info = credentials_info
        self._token_fn = token_fn          # 테스트 주입용(토큰 발급 우회)
        self._token: str | None = None
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_env(cls) -> "GA4Client | None":
        """GA4_PROPERTY_ID + 서비스계정 JSON 이 모두 있을 때만 생성, 아니면 None."""
        pid = os.environ.get("GA4_PROPERTY_ID")
        raw = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
        if not pid or not raw:
            return None
        try:
            info = json.loads(raw)
        except (ValueError, TypeError):
            return None
        return cls(pid, info)

    def _access_token(self) -> str:
        if self._token:
            return self._token
        if self._token_fn:
            self._token = self._token_fn()
            return self._token
        # 서비스계정 → OAuth2 토큰 (google-auth, 지연 임포트)
        from google.oauth2 import service_account  # noqa: PLC0415
        import google.auth.transport.requests as gtr  # noqa: PLC0415

        creds = service_account.Credentials.from_service_account_info(
            self.credentials_info, scopes=[GA4_SCOPE])
        creds.refresh(gtr.Request())
        self._token = creds.token
        return self._token

    def daily_visitors(self, date: str) -> int | None:
        """일자 방문자수(totalUsers). 실패 시 None. 401 이면 토큰 1회 재발급."""
        body = {
            "dateRanges": [{"startDate": date, "endDate": date}],
            "metrics": [{"name": "totalUsers"}],
        }
        path = f"/v1beta/properties/{self.property_id}:runReport"
        for attempt in (1, 2):
            try:
                resp = self._http.post(
                    path, headers={"Authorization": f"Bearer {self._access_token()}"}, json=body)
            except Exception:  # noqa: BLE001
                return None
            if resp.status_code == 401 and attempt == 1:
                self._token = None  # 만료 → 재발급 후 1회 재시도
                continue
            if resp.status_code != 200:
                return None
            return ga4_report_to_visitors(resp.json())
        return None

    def daily_new_returning(self, date: str) -> dict | None:
        """일자 신규/재방문 방문자수({'new','returning'}). 실패 시 None. 401 이면 토큰 1회 재발급."""
        body = {
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "newVsReturning"}],
            "metrics": [{"name": "totalUsers"}],
        }
        path = f"/v1beta/properties/{self.property_id}:runReport"
        for attempt in (1, 2):
            try:
                resp = self._http.post(
                    path, headers={"Authorization": f"Bearer {self._access_token()}"}, json=body)
            except Exception:  # noqa: BLE001
                return None
            if resp.status_code == 401 and attempt == 1:
                self._token = None
                continue
            if resp.status_code != 200:
                return None
            return ga4_report_to_new_returning(resp.json())
        return None

    def daily_channel_conversions(self, date: str, mapping: dict | None = None) -> dict[str, dict] | None:
        """일자 채널(sessionSourceMedium)별 전환수/전환매출. 실패 시 None. 401 이면 토큰 1회 재발급.

        광고 채널별 실제 전환은 각 광고 플랫폼 자체 보고값보다 GA4 값이 더 신뢰도 높은 경우가
        많아, 이 값이 있으면 ads facts 의 conversions 를 이 값으로 대체한다(AdsCollector 참고).
        """
        body = {
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "sessionSourceMedium"}],
            "metrics": [{"name": "conversions"}, {"name": "purchaseRevenue"}],
        }
        path = f"/v1beta/properties/{self.property_id}:runReport"
        for attempt in (1, 2):
            try:
                resp = self._http.post(
                    path, headers={"Authorization": f"Bearer {self._access_token()}"}, json=body)
            except Exception:  # noqa: BLE001
                return None
            if resp.status_code == 401 and attempt == 1:
                self._token = None
                continue
            if resp.status_code != 200:
                return None
            return ga4_report_to_channel_conversions(resp.json(), mapping)
        return None

    def close(self) -> None:
        self._http.close()
