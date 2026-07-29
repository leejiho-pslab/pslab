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

# 전환으로 셀 GA4 이벤트명.
# keek 속성은 주요 이벤트(별표)가 13개 중 12개나 켜져 있어(장바구니 보기·제품분류 클릭 등)
# GA4 의 keyEvents/conversions 지표를 그대로 쓰면 전환이 10배 넘게 부풀려진다.
# GA4 설정은 건드리지 않고(기존 리포트 보존) 이 이벤트만 세어 실구매를 집계한다.
CONVERSION_EVENT = os.environ.get("GA4_CONVERSION_EVENT", "결제완료")

# 구매 퍼널 단계 — (GA4 이벤트명, 표시 라벨). keek 스토어에 실제로 쌓이는 이벤트만 사용.
# GA4 Data API 는 다단계 경로(A→B→C 순서)를 주지 않으므로(BigQuery 내보내기 필요),
# 이벤트 건수의 단계별 감소로 "구매까지 어디서 새는지"를 본다.
FUNNEL_STEPS = [
    ("page_view", "페이지 조회"),
    ("제품분류_클릭", "상품 탐색"),
    ("buy_now_버튼_클릭", "바로구매 클릭"),
    ("장바구니_버튼_클릭", "장바구니 담기"),
    ("장바구니_보기", "장바구니 확인"),
    ("구매하기_버튼_클릭", "구매하기 클릭"),
    ("결제완료", "결제 완료"),
]
FUNNEL_EVENT_NAMES = [e for e, _ in FUNNEL_STEPS]


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


# 사이트 분석 지표 — GA4 metric 이름 → facts metric 키 (runReport metrics 순서와 일치).
# site_ 접두어: 카페24 쪽 visitors 등과 metric 이름이 겹치면 소스 무관 조회가 오염됨.
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


def ga4_report_to_source_medium(raw: dict) -> list[dict]:
    """sessionSourceMedium × eventName 필터 runReport → [{"source_medium","sessions","users","conversions"}].

    conversions 는 CONVERSION_EVENT(결제완료) 이벤트 건수만 센다 —
    GA4 keyEvents 지표는 keek 속성에서 부풀려져 있어 쓰지 않는다.
    """
    out: list[dict] = []
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        sm = (dims[0].get("value") or "").strip()
        if not sm:
            continue

        def _v(i):
            try:
                return float(vals[i].get("value", 0) or 0) if i < len(vals) else 0.0
            except (TypeError, ValueError):
                return 0.0

        out.append({"source_medium": sm, "sessions": _v(0), "users": _v(1), "conversions": 0.0})
    return out


def ga4_report_to_event_by_source(raw: dict) -> dict[str, float]:
    """sessionSourceMedium 별 특정 이벤트 건수 → {source_medium: count}."""
    out: dict[str, float] = {}
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        sm = (dims[0].get("value") or "").strip()
        if not sm:
            continue
        try:
            v = float(vals[0].get("value", 0) or 0) if vals else 0.0
        except (TypeError, ValueError):
            v = 0.0
        out[sm] = out.get(sm, 0.0) + v
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


def ga4_report_to_landing_pages(raw: dict) -> list[dict]:
    """landingPage 차원 runReport(sessions, bounceRate, engagementRate) → 랜딩페이지별 지표.

    GA4 Data API 에는 UA 의 exits(종료수) 지표가 없다(probe 로 400 확인). 대신
    bounceRate(이탈률)로 "들어와서 바로 나간 비율"을 본다.
    """
    out: list[dict] = []
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or [{}]
        vals = r.get("metricValues") or []
        page = (dims[0].get("value") or "").strip()
        if not page:
            continue

        def _v(i):
            try:
                return float(vals[i].get("value", 0) or 0) if i < len(vals) else 0.0
            except (TypeError, ValueError):
                return 0.0

        out.append({"page": page, "sessions": _v(0),
                    "bounce_rate": round(_v(1) * 100, 2), "engagement_rate": round(_v(2) * 100, 2)})
    return out


def ga4_report_to_landing_by_channel(raw: dict) -> list[dict]:
    """landingPage × sessionSourceMedium runReport → 광고별 착지 페이지 분포(유입 경로 시작점)."""
    out: list[dict] = []
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or []
        vals = r.get("metricValues") or []
        if len(dims) < 2:
            continue
        page = (dims[0].get("value") or "").strip()
        sm = (dims[1].get("value") or "").strip()
        if not page or not sm:
            continue
        try:
            sessions = float(vals[0].get("value", 0) or 0) if vals else 0.0
        except (TypeError, ValueError):
            sessions = 0.0
        out.append({"page": page, "source_medium": sm, "sessions": sessions})
    return out


def ga4_report_to_funnel(raw: dict) -> list[dict]:
    """eventName × sessionSourceMedium runReport → [{event, source_medium, count}] (퍼널 원자료)."""
    out: list[dict] = []
    for r in (raw or {}).get("rows") or []:
        dims = r.get("dimensionValues") or []
        vals = r.get("metricValues") or []
        if len(dims) < 2:
            continue
        ev = (dims[0].get("value") or "").strip()
        sm = (dims[1].get("value") or "").strip()
        if not ev or not sm:
            continue
        try:
            cnt = float(vals[0].get("value", 0) or 0) if vals else 0.0
        except (TypeError, ValueError):
            cnt = 0.0
        out.append({"event": ev, "source_medium": sm, "count": cnt})
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

    def daily_conversions_by_source(self, date: str) -> dict[str, float] | None:
        """일자 매체별 전환수 — CONVERSION_EVENT(결제완료) 이벤트만 센다.

        GA4 의 keyEvents/conversions 지표는 주요 이벤트가 과다 지정된 속성에서
        부풀려지므로 쓰지 않고, eventName 필터로 실구매 이벤트만 집계한다.
        """
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "sessionSourceMedium"}],
            "metrics": [{"name": "eventCount"}],
            "dimensionFilter": {
                "filter": {
                    "fieldName": "eventName",
                    "stringFilter": {"matchType": "EXACT", "value": CONVERSION_EVENT},
                }
            },
        }, label="conversions")
        return ga4_report_to_event_by_source(raw) if raw is not None else None

    def daily_source_medium(self, date: str) -> list[dict] | None:
        """일자 sessionSourceMedium 별 세션/사용자/전환. 실패 시 None(사유는 로그).

        세션·사용자는 전체 이벤트 기준으로 받고, 전환만 결제완료 이벤트로 따로 조회해
        합친다(한 요청에 eventName 필터를 걸면 세션수까지 그 이벤트 기준으로 좁아짐).
        """
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "sessionSourceMedium"}],
            "metrics": [{"name": "sessions"}, {"name": "totalUsers"}],
        }, label="source_medium")
        if raw is None:
            return None
        rows = ga4_report_to_source_medium(raw)
        conv = self.daily_conversions_by_source(date) or {}
        for row in rows:
            row["conversions"] = conv.get(row["source_medium"], 0.0)
        return rows

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

    def daily_landing_pages(self, date: str, limit: int = 20) -> list[dict] | None:
        """일자 랜딩페이지별 세션·이탈률·참여율 — "어느 페이지에서 새는지" 추적용."""
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "landingPage"}],
            "metrics": [{"name": "sessions"}, {"name": "bounceRate"}, {"name": "engagementRate"}],
            "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}],
            "limit": limit,
        }, label="landing_pages")
        return ga4_report_to_landing_pages(raw) if raw is not None else None

    def daily_landing_by_channel(self, date: str, limit: int = 60) -> list[dict] | None:
        """일자 (랜딩페이지 × 매체)별 세션 — 어떤 광고가 어디로 보내는지(유입 경로 시작점)."""
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "landingPage"}, {"name": "sessionSourceMedium"}],
            "metrics": [{"name": "sessions"}],
            "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}],
            "limit": limit,
        }, label="landing_by_channel")
        return ga4_report_to_landing_by_channel(raw) if raw is not None else None

    def daily_funnel(self, date: str, limit: int = 200) -> list[dict] | None:
        """일자 (퍼널 이벤트 × 매체)별 건수 — 채널별 구매 퍼널 원자료.

        FUNNEL_STEPS 이벤트만 inListFilter 로 받아 응답을 작게 유지한다.
        """
        raw = self._run_report({
            "dateRanges": [{"startDate": date, "endDate": date}],
            "dimensions": [{"name": "eventName"}, {"name": "sessionSourceMedium"}],
            "metrics": [{"name": "eventCount"}],
            "dimensionFilter": {
                "filter": {
                    "fieldName": "eventName",
                    "inListFilter": {"values": FUNNEL_EVENT_NAMES},
                }
            },
            "limit": limit,
        }, label="funnel")
        return ga4_report_to_funnel(raw) if raw is not None else None

    def daily_new_returning_metrics(self, date: str) -> dict[str, float] | None:
        """일자 신규/재방문 사용자수 → {'site_new','site_returning'}. 실패 시 None."""
        nr = self.daily_new_returning(date)
        if nr is None:
            return None
        return {"site_new": float(nr.get("new", 0)), "site_returning": float(nr.get("returning", 0))}

    def close(self) -> None:
        self._http.close()
