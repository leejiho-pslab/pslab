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
import logging
import os

import httpx

GA4_BASE = "https://analyticsdata.googleapis.com"
GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly"

log = logging.getLogger("cafe24_ops.ga4")


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


# GA4 sessionSourceMedium("meta / cpc" 등) → 대시보드 광고 채널 키.
# 디브릭 실제 GA4 값 기준(meta/cpc, naver_sa/cpc, ig/social 등)으로 매핑.
# config/ga4_channel_map.yaml 로 재정의 가능(없으면 이 기본값 사용).
# 광고 채널이 아닌 값(direct/organic/referral 등)은 여기 없으면 광고 전환 대체에서 제외된다.
DEFAULT_SOURCE_MEDIUM_CHANNEL = {
    # Meta(페이스북/인스타)
    "meta / cpc": "meta",
    "facebook / cpc": "meta",
    "instagram / cpc": "meta",
    "fb / cpc": "meta",
    "ig / cpc": "meta",
    "ig / social": "meta",
    "instagram / social": "meta",
    "facebook / social": "meta",
    "fb / social": "meta",
    # 네이버 검색광고(파워링크) — GA4는 파워링크/플레이스를 구분 못 해 통칭 naver_sa 로 들어옴
    "naver_sa / cpc": "naver_powerlink",
    "naver / cpc": "naver_powerlink",
    "naver_powerlink / cpc": "naver_powerlink",
    "naver_place / cpc": "naver_place",
    "naver_place / referral": "naver_place",
    # 구글/카카오(후순위)
    "google / cpc": "google",
    "kakao / cpc": "kakao",
    "kakaomoment / cpc": "kakao",
}

# 광고 채널 집합 — 광고 전환 대체 시 이 채널들에만 GA4 전환을 붙인다(비광고 유입은 제외).
AD_CHANNELS = {"meta", "naver_powerlink", "naver_place", "google", "kakao"}


# 사이트 분석 지표 — GA4 metric 이름 → facts metric 키 (순서 중요: runReport metrics 순서와 일치)
# site_ 접두어: 카페24 쪽 visitors 등과 metric 이름이 겹치면 소스 무관 조회(_scalar 등)가 오염됨.
SITE_METRICS = [
    ("totalUsers", "site_visitors"),                  # 사이트 방문자
    ("sessions", "site_sessions"),                    # 세션수
    ("screenPageViews", "site_page_views"),           # 페이지뷰
    ("averageSessionDuration", "site_avg_duration"),  # 평균 체류시간(초)
]


def ga4_report_to_site_metrics(raw: dict) -> dict[str, float] | None:
    """단일 dateRange runReport(SITE_METRICS 순서) 응답 → {metric_key: value}. 행 없으면 None."""
    rows = (raw or {}).get("rows") or []
    if not rows:
        return None
    vals = rows[0].get("metricValues") or []
    out: dict[str, float] = {}
    for i, (_, key) in enumerate(SITE_METRICS):
        try:
            out[key] = float(vals[i].get("value", 0) or 0) if i < len(vals) else 0.0
        except (TypeError, ValueError):
            out[key] = 0.0
    return out


def _metric_index(raw: dict, fallback: list[str]) -> dict[str, int]:
    """runReport 응답의 metricHeaders 로 {metric_name: 열 인덱스} 를 만든다.
    헤더가 없으면 요청 순서(fallback)를 그대로 사용한다(테스트/구버전 대비)."""
    headers = (raw or {}).get("metricHeaders") or []
    if headers:
        return {(h.get("name") or ""): i for i, h in enumerate(headers)}
    return {name: i for i, name in enumerate(fallback)}


def _conversions_from(vals: list, idx: dict[str, int]) -> float:
    """conversions / keyEvents 중 존재하는 값의 최댓값. GA4 는 2024년 conversions →
    keyEvents 로 지표를 개편해, 신규 속성은 conversions 가 0 이고 keyEvents 만 채워진다.
    둘 다 요청해 더 큰 값을 전환수로 삼으면 구/신 속성 모두에서 값이 보인다."""
    best = 0.0
    for name in ("conversions", "keyEvents"):
        i = idx.get(name)
        if i is None:
            continue
        try:
            v = float(vals[i].get("value", 0) or 0) if i < len(vals) else 0.0
        except (TypeError, ValueError):
            v = 0.0
        best = max(best, v)
    return best


def ga4_report_to_source_medium(raw: dict, metric_order: list[str] | None = None) -> list[dict]:
    """sessionSourceMedium 차원 runReport → [{"source_medium","sessions","users","conversions"}].
    conversions 는 conversions/keyEvents 중 큰 값. 행 없으면 빈 리스트."""
    idx = _metric_index(raw, metric_order or ["sessions", "totalUsers", "conversions"])
    out: list[dict] = []
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        sm = (dims[0].get("value") or "").strip()
        if not sm:
            continue
        def _v(name):
            i = idx.get(name)
            try:
                return float(vals[i].get("value", 0) or 0) if i is not None and i < len(vals) else 0.0
            except (TypeError, ValueError):
                return 0.0
        out.append({"source_medium": sm, "sessions": _v("sessions"), "users": _v("totalUsers"),
                    "conversions": _conversions_from(vals, idx)})
    return out


def ga4_report_to_top_pages(raw: dict) -> list[dict]:
    """pageTitle 차원 runReport(screenPageViews) → [{"page","views"}]. 행 없으면 빈 리스트."""
    out: list[dict] = []
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        page = (dims[0].get("value") or "").strip()
        if not page:
            continue
        try:
            views = float(vals[0].get("value", 0) or 0) if vals else 0.0
        except (TypeError, ValueError):
            views = 0.0
        out.append({"page": page, "views": views})
    return out


def ga4_report_to_channel_conversions(
    raw: dict, mapping: dict | None = None, metric_order: list[str] | None = None
) -> dict[str, dict]:
    """sessionSourceMedium 차원 runReport(keyEvents/conversions, purchaseRevenue) →
    {channel: {"conversions": n, "ga4_conversion_value": v}}.

    conversions 는 conversions/keyEvents 중 큰 값(GA4 지표 개편 대응).
    광고 채널(AD_CHANNELS)로 매핑되는 유입만 반영한다(비광고 유입 제외).
    """
    mapping = mapping or DEFAULT_SOURCE_MEDIUM_CHANNEL
    idx = _metric_index(raw, metric_order or ["conversions", "purchaseRevenue"])
    rev_i = idx.get("purchaseRevenue")
    out: dict[str, dict] = {}
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        source_medium = (dims[0].get("value") or "").strip()
        channel = mapping.get(source_medium)
        if channel not in AD_CHANNELS:
            continue
        conv = _conversions_from(vals, idx)
        try:
            rev = float(vals[rev_i].get("value", 0) or 0) if rev_i is not None and rev_i < len(vals) else 0.0
        except (TypeError, ValueError):
            rev = 0.0
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

    def _run_report(self, body: dict, label: str) -> dict | None:
        """runReport 공통 실행 — 실패 시 실제 사유를 로그로 남기고 None.

        조용히 None 만 반환하면 "ga4 0건"의 원인(권한/미활성화 API/속성ID 오류 등)을
        알 수 없어 진단이 어렵다. 여기서 응답 본문·예외를 warning 으로 남긴다.
        """
        path = f"/v1beta/properties/{self.property_id}:runReport"
        for attempt in (1, 2):
            try:
                resp = self._http.post(
                    path, headers={"Authorization": f"Bearer {self._access_token()}"}, json=body)
            except Exception as e:  # noqa: BLE001
                log.warning("[ga4:%s] 요청 실패(토큰/네트워크): %s: %s", label, type(e).__name__, e)
                return None
            if resp.status_code == 401 and attempt == 1:
                self._token = None
                continue
            if resp.status_code != 200:
                log.warning("[ga4:%s] HTTP %s — %s", label, resp.status_code, resp.text[:400])
                return None
            return resp.json()
        return None

    def daily_site_metrics(self, date: str) -> dict[str, float] | None:
        """일자 사이트 지표(방문자/세션/페이지뷰/평균 체류시간). 실패 시 None(사유는 로그)."""
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "metrics": [{"name": name} for name, _ in SITE_METRICS],
        }, label="site")
        return ga4_report_to_site_metrics(raw) if raw is not None else None

    def daily_channel_conversions(self, date: str, mapping: dict | None = None) -> dict[str, dict] | None:
        """일자 채널(sessionSourceMedium)별 전환수/전환매출. 실패 시 None(사유는 로그).

        광고 채널별 실제 전환은 각 광고 플랫폼 자체 보고값보다 GA4 값이 더 신뢰도 높은 경우가
        많아, 이 값이 있으면 ads facts 의 conversions 를 이 값으로 대체한다(AdsCollector 참고).
        """
        # keyEvents(신규 명칭)와 conversions(구 명칭)는 GA4 내부적으로 같은 지표라
        # 한 요청에 함께 넣으면 400("Found duplicate metrics: conversions"). 따라서
        # keyEvents 단독으로 먼저 요청하고, 미지원(구 속성)으로 실패하면 conversions 단독 재시도.
        raw, order = self._report_with_conv_metric(
            date, dims=[{"name": "sessionSourceMedium"}], base=["purchaseRevenue"], label="conversions")
        return ga4_report_to_channel_conversions(raw, mapping, order) if raw is not None else None

    def _report_with_conv_metric(self, date, dims, base, label):
        """전환 지표(keyEvents→실패 시 conversions)를 base 지표 앞에 붙여 runReport.
        반환: (raw|None, 사용된 metric 순서 리스트)."""
        for conv in ("keyEvents", "conversions"):
            order = [conv, *base]
            raw = self._run_report({
                "dateRanges": [{"startDate": date, "endDate": date}],
                "dimensions": dims,
                "metrics": [{"name": m} for m in order],
            }, label=label if conv == "keyEvents" else f"{label}_conv")
            if raw is not None:
                return raw, order
        return None, [conv, *base]

    def daily_source_medium(self, date: str) -> list[dict] | None:
        """일자 sessionSourceMedium 별 세션/사용자/전환. 실패 시 None(사유는 로그).
        전환은 keyEvents(실패 시 conversions) — 둘은 동일 지표라 함께 요청하면 400."""
        raw, order = self._report_with_conv_metric(
            date, dims=[{"name": "sessionSourceMedium"}],
            base=["sessions", "totalUsers"], label="source_medium")
        return ga4_report_to_source_medium(raw, order) if raw is not None else None

    def daily_top_pages(self, date: str, limit: int = 15) -> list[dict] | None:
        """일자 페이지(pageTitle)별 조회수 상위. 실패 시 None(사유는 로그)."""
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "pageTitle"}],
            "metrics": [{"name": "screenPageViews"}],
            "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}],
            "limit": limit,
        }, label="top_pages")
        return ga4_report_to_top_pages(raw) if raw is not None else None

    def daily_new_returning_metrics(self, date: str) -> dict[str, float] | None:
        """일자 신규/재방문 사용자수 → {'site_new','site_returning'}. 실패 시 None."""
        nr = self.daily_new_returning(date)
        if nr is None:
            return None
        return {"site_new": float(nr.get("new", 0)), "site_returning": float(nr.get("returning", 0))}

    def close(self) -> None:
        self._http.close()
