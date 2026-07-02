"""Meta(Facebook/Instagram) 광고 — Marketing API Insights 커넥터.

자격증명(META_ACCESS_TOKEN, 계정 ID)이 있을 때만 활성화된다.
HTTP 호출부는 실제 토큰으로 검증 필요(엔드포인트/버전 확인), 응답 → 표준 metric 매핑은
순수 함수(meta_insights_to_facts)로 분리해 단위 테스트로 검증한다.

참고: https://developers.facebook.com/docs/marketing-api/insights
"""
from __future__ import annotations

import os

import httpx

META_API_VERSION = "v21.0"
META_BASE = "https://graph.facebook.com"


# 구매 전환은 픽셀/온사이트/통합 등 여러 action_type 으로 옵니다. 우선순위대로 첫 값 사용
# (합산하면 중복 카운트 위험). omni_purchase 가 Meta 권장 통합 지표.
PURCHASE_ACTION_TYPES = (
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_web_purchase",
)


def _action_value(items, action_types) -> float:
    if isinstance(action_types, str):
        action_types = (action_types,)
    index = {it.get("action_type"): it.get("value") for it in (items or [])}
    for at in action_types:
        if at in index:
            try:
                return float(index[at] or 0)
            except (TypeError, ValueError):
                return 0.0
    return 0.0


def meta_insights_to_facts(date: str, raw: dict) -> list[dict]:
    """Insights 응답 → 표준 metric 레코드(dims.channel=meta)."""
    rows = (raw or {}).get("data") or []
    if not rows:
        return []
    d = rows[0]
    values = {
        "ad_cost": float(d.get("spend", 0) or 0),
        "impressions": float(d.get("impressions", 0) or 0),
        "clicks": float(d.get("clicks", 0) or 0),
        "conversions": _action_value(d.get("actions"), PURCHASE_ACTION_TYPES),
        "ad_sales": _action_value(d.get("action_values"), PURCHASE_ACTION_TYPES),
    }
    return [
        {"date": date, "source": "ads", "metric": k, "value": v, "dims": {"channel": "meta"}}
        for k, v in values.items()
    ]


def meta_ad_insights_to_facts(date: str, raw: dict, thumbs: dict | None = None) -> list[dict]:
    """ad-level Insights 응답 → 소재(ad)별 표준 metric 레코드(source='creative').

    dims = {creative_id(ad_id), name(ad_name), channel='meta', thumb(이미지URL)}.
    광고 히스토리(소재 카드)용. 구매수/구매전환값/노출/클릭/비용을 담는다.
    """
    thumbs = thumbs or {}
    rows = (raw or {}).get("data") or []
    out: list[dict] = []
    for d in rows:
        ad_id = str(d.get("ad_id") or d.get("id") or "")
        if not ad_id:
            continue
        dims = {
            "creative_id": ad_id,
            "name": d.get("ad_name") or ad_id,
            "channel": "meta",
            "thumb": thumbs.get(ad_id, ""),
        }
        values = {
            "ad_cost": float(d.get("spend", 0) or 0),
            "impressions": float(d.get("impressions", 0) or 0),
            "clicks": float(d.get("clicks", 0) or 0),
            "conversions": _action_value(d.get("actions"), PURCHASE_ACTION_TYPES),
            "ad_sales": _action_value(d.get("action_values"), PURCHASE_ACTION_TYPES),
        }
        out += [{"date": date, "source": "creative", "metric": k, "value": v, "dims": dims}
                for k, v in values.items()]
    return out


class MetaAdsClient:
    def __init__(
        self,
        account_id: str,
        access_token: str,
        transport: httpx.BaseTransport | None = None,
        base_url: str = META_BASE,
        version: str = META_API_VERSION,
        timeout: float = 30.0,
    ):
        # 경로에서 act_ 를 붙이므로, 입력에 act_ 가 있어도 중복되지 않게 제거
        self.account_id = str(account_id).removeprefix("act_")
        self.access_token = access_token
        self.version = version
        self._http = httpx.Client(base_url=base_url, transport=transport, timeout=timeout)

    @classmethod
    def from_account(cls, acc: dict, transport: httpx.BaseTransport | None = None) -> "MetaAdsClient":
        return cls(
            account_id=str(acc.get("account_id") or os.environ.get("META_AD_ACCOUNT_ID", "")),
            access_token=os.environ.get("META_ACCESS_TOKEN", ""),
            transport=transport,
        )

    def exchange_for_long_lived(self, app_id: str, app_secret: str) -> str | None:
        """단기/장기 토큰 → 장기(약 60일) 토큰으로 교환.

        매 실행마다 호출해 만료를 갱신하면(카페24 토큰 회전과 동일 발상) 무인 환경에서
        토큰이 끊기지 않는다. 실패하면 None(기존 토큰으로 수집 계속 시도).
        """
        if not (app_id and app_secret and self.access_token):
            return None
        r = self._http.get(
            f"/{self.version}/oauth/access_token",
            params={
                "grant_type": "fb_exchange_token",
                "client_id": app_id,
                "client_secret": app_secret,
                "fb_exchange_token": self.access_token,
            },
        )
        if r.status_code != 200:
            return None
        return (r.json() or {}).get("access_token")

    def insights(self, date: str) -> dict:
        # 토큰은 쿼리 대신 Authorization 헤더로 보낸다 → URL(로그)에 토큰이 노출되지 않음.
        path = f"/{self.version}/act_{self.account_id}/insights"
        params = {
            "level": "account",
            "fields": "spend,impressions,clicks,actions,action_values",
            "time_range[since]": date,
            "time_range[until]": date,
        }
        r = self._http.get(path, params=params,
                           headers={"Authorization": f"Bearer {self.access_token}"})
        r.raise_for_status()
        return r.json()

    def fetch_facts(self, date: str) -> list[dict]:
        return meta_insights_to_facts(date, self.insights(date))

    # ---- 소재(ad) 단위 — 광고 히스토리용 -----------------------------
    def ad_insights(self, date: str) -> dict:
        path = f"/{self.version}/act_{self.account_id}/insights"
        params = {
            "level": "ad",
            "fields": "ad_id,ad_name,spend,impressions,clicks,actions,action_values",
            "time_range[since]": date,
            "time_range[until]": date,
            "limit": 200,
        }
        r = self._http.get(path, params=params,
                           headers={"Authorization": f"Bearer {self.access_token}"})
        r.raise_for_status()
        return r.json()

    def ad_thumbnails(self) -> dict:
        """ad_id → 소재 이미지 URL(image_url 우선, 없으면 thumbnail_url). 실패 시 빈 dict."""
        path = f"/{self.version}/act_{self.account_id}/ads"
        params = {"fields": "id,creative{thumbnail_url,image_url}", "limit": 400}
        try:
            r = self._http.get(path, params=params,
                               headers={"Authorization": f"Bearer {self.access_token}"})
            r.raise_for_status()
        except Exception:  # noqa: BLE001
            return {}
        out: dict = {}
        for a in (r.json() or {}).get("data", []) or []:
            cr = a.get("creative") or {}
            url = cr.get("image_url") or cr.get("thumbnail_url")
            if a.get("id") and url:
                out[str(a["id"])] = url
        return out

    def fetch_creatives(self, date: str) -> list[dict]:
        """소재별 성과 facts(source='creative') — 이미지 포함."""
        thumbs = self.ad_thumbnails()
        return meta_ad_insights_to_facts(date, self.ad_insights(date), thumbs)

    def close(self) -> None:
        self._http.close()
