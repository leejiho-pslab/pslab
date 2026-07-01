"""카페24 Admin API 수집기.

- mock: 기존 keek 운영 대시보드와 동일한 KPI 셋을 일자별로 생성 (결정적)
- live: 카페24 Admin API(주문)를 호출해 매출/주문수/객단가를 산출

방문자·전환율 등 주문 외 지표는 별도 통계/연동이 필요하므로 Phase 1 에서는
주문 기반 지표(gross_sales, order_count, aov)부터 실연동한다.
"""
from __future__ import annotations

import hashlib
import random

from .base import BaseCollector


def _rng(date: str) -> random.Random:
    seed = int(hashlib.sha256(date.encode()).hexdigest(), 16) % (2**32)
    return random.Random(seed)


def order_amount(order: dict) -> float:
    """주문 1건의 결제 금액을 안전하게 추출한다 (API 버전별 필드 차이 대응)."""
    for key in ("payment_amount", "order_price_amount"):
        v = order.get(key)
        if v not in (None, ""):
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    aoa = order.get("actual_order_amount") or {}
    for key in ("payment_amount", "order_amount"):
        v = aoa.get(key)
        if v not in (None, ""):
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    return 0.0


def orders_to_metrics(date: str, orders: list[dict], order_count: int | None = None) -> list[dict]:
    """주문 목록 → 표준 metric 레코드(gross_sales/order_count/aov)."""
    gross = sum(order_amount(o) for o in orders)
    count = order_count if order_count is not None else len(orders)
    aov = (gross / count) if count else 0.0
    values = {
        "gross_sales": float(gross),
        "order_count": float(count),
        "aov": round(aov, 2),
    }
    return [
        {"date": date, "source": "cafe24", "metric": k, "value": v}
        for k, v in values.items()
    ]


def visitor_metrics(date: str, order_count: int, visitors: int | None) -> list[dict]:
    """방문자수가 있으면 visitors + conversion_rate(구매전환율, %)를 만든다."""
    if not visitors or visitors <= 0:
        return []
    return [
        {"date": date, "source": "cafe24", "metric": "visitors", "value": float(visitors)},
        {"date": date, "source": "cafe24", "metric": "conversion_rate",
         "value": round(order_count / visitors * 100, 2)},
    ]


def visitor_segment_metrics(date: str, seg: dict | None) -> list[dict]:
    """GA4 신규/재방문 방문자수 → visitors_new / visitors_returning facts (있을 때만)."""
    if not seg:
        return []
    out = []
    if seg.get("new") is not None:
        out.append({"date": date, "source": "cafe24", "metric": "visitors_new",
                    "value": float(seg["new"])})
    if seg.get("returning") is not None:
        out.append({"date": date, "source": "cafe24", "metric": "visitors_returning",
                    "value": float(seg["returning"])})
    return out


def signup_metrics(date: str, new_signups: int | None) -> list[dict]:
    if new_signups is None:
        return []
    return [{"date": date, "source": "cafe24", "metric": "new_signups", "value": float(new_signups)}]


def order_breakdowns(date: str, orders: list[dict]) -> list[dict]:
    """실주문 → 디바이스/신규·재구매 매출 차원 팩트 (추가 scope 불필요).

    - 디바이스: order_from_mobile == "T" → mobile, else pc
    - 신규/재구매: first_order == "F" → 재구매(returning), 그 외(T·null·게스트/마켓) → 신규(new)
      (마켓/비회원 주문은 first_order 가 null 이라 '신규'로 집계 — 합계가 매출과 일치)
    """
    dev = {"mobile": 0.0, "pc": 0.0}
    dev_count = {"mobile": 0, "pc": 0}
    cust = {"new": 0.0, "returning": 0.0}
    for o in orders:
        amt = order_amount(o)
        d = "mobile" if o.get("order_from_mobile") == "T" else "pc"
        dev[d] += amt
        dev_count[d] += 1
        cust["returning" if o.get("first_order") == "F" else "new"] += amt
    out = []
    for d, v in dev.items():
        out.append({"date": date, "source": "cafe24", "metric": "device_sales",
                    "value": round(v, 2), "dims": {"device": d}})
    for d, c in dev_count.items():
        out.append({"date": date, "source": "cafe24", "metric": "device_order_count",
                    "value": float(c), "dims": {"device": d}})
    for c, v in cust.items():
        out.append({"date": date, "source": "cafe24", "metric": "customer_sales",
                    "value": round(v, 2), "dims": {"customer_type": c}})
    return out


def _item_amount(it: dict) -> float:
    """주문 품목 결제금액 — 가능한 필드를 순서대로 시도(가격×수량 폴백)."""
    for k in ("payment_amount", "product_price_amount", "actual_payment_amount"):
        v = it.get(k)
        if v not in (None, ""):
            try:
                return float(v)
            except (TypeError, ValueError):
                pass
    try:
        qty = float(it.get("quantity", 0) or 0)
        price = float(it.get("product_price", it.get("price", 0)) or 0)
        opt = float(it.get("option_price", 0) or 0)
        return (price + opt) * qty
    except (TypeError, ValueError):
        return 0.0


def _allocated_items(orders: list[dict]):
    """주문별 실결제액(order_amount)을 품목에 비례 배분해 (item, 배분금액)을 낸다.

    카페24 embed=items 의 품목 payment_amount 가 None 인 경우가 많아, 품목 정가
    (_item_amount)를 가중치로 주문 실결제액을 나눈다. → 카테고리/베스트 합이 매출과
    일치하고 할인·배송비가 반영된 '실매출 기여'가 된다. 가중치 합이 0이면 균등분배.
    """
    for o in orders:
        items = o.get("items") or []
        if not items:
            continue
        weights = [_item_amount(it) for it in items]
        tot = sum(weights)
        paid = order_amount(o)
        for it, w in zip(items, weights):
            amt = paid * (w / tot) if tot > 0 else paid / len(items)
            yield it, amt


def best_products(date: str, orders: list[dict], top_n: int = 10) -> list[dict]:
    """주문 items 집계 → 베스트상품(product_sales) 상위 N. embed=items 필요.

    실결제액을 품목에 비례배분해 집계(정가 폴백의 과대계상 방지)."""
    agg: dict[str, float] = {}
    for it, amt in _allocated_items(orders):
        name = it.get("product_name") or it.get("product_name_default") or it.get("product_code")
        if not name:
            continue
        agg[name] = agg.get(name, 0.0) + amt
    top = sorted(agg.items(), key=lambda kv: kv[1], reverse=True)[:top_n]
    return [{"date": date, "source": "cafe24", "metric": "product_sales",
             "value": round(v, 2), "dims": {"product": name}} for name, v in top]


def _category_name_depth(cat: dict) -> tuple[str | None, int]:
    """카테고리 표시명과 깊이. full_category_name 은 {'1':'SHOP','2':'Pillowdy',...} dict.

    최하위(가장 구체적) 레벨명을 쓰고, 비어있지 않은 레벨 수를 깊이로 본다.
    """
    fcn = cat.get("full_category_name")
    if isinstance(fcn, dict):
        vals = [v for _, v in sorted(fcn.items()) if v]
        if vals:
            return vals[-1], len(vals)
    if isinstance(fcn, str) and fcn:
        return fcn, 1
    return cat.get("category_name"), 1


def build_category_map(client) -> dict[int, str]:
    """product_no → 카테고리명. /products?category=N 로 구축(1회 캐시 권장).

    상품이 여러 카테고리에 속하면 '가장 구체적인(깊은)' 카테고리를 채택한다.
    """
    best: dict[int, tuple[int, str]] = {}  # pno -> (depth, name)
    try:
        cats = client.list_categories()
    except Exception:
        return {}
    for cat in cats:
        cno = cat.get("category_no")
        name, depth = _category_name_depth(cat)
        if cno is None or not name:
            continue
        try:
            for pno in client.list_category_product_nos(cno):
                prev = best.get(pno)
                if prev is None or depth > prev[0]:
                    best[pno] = (depth, name)
        except Exception:
            continue
    return {pno: nm for pno, (_, nm) in best.items()}


def category_sales(date: str, orders: list[dict], catmap: dict[int, str]) -> list[dict]:
    """주문 items → 카테고리별 매출. 매핑 없는 상품은 '기타'.

    실결제액을 품목에 비례배분해 집계(합계가 매출과 일치)."""
    agg: dict[str, float] = {}
    for it, amt in _allocated_items(orders):
        pno = it.get("product_no")
        cat = None
        if pno is not None:
            try:
                cat = catmap.get(int(pno))
            except (TypeError, ValueError):
                cat = None
        cat = cat or "기타"
        agg[cat] = agg.get(cat, 0.0) + amt
    return [{"date": date, "source": "cafe24", "metric": "category_sales",
             "value": round(v, 2), "dims": {"category": c}} for c, v in agg.items()]


MOCK_PRODUCTS = [
    "keek Pillow", "Filovely Basic Windbreaker", "keek Recovery Slipper",
    "keek Travel Pouch", "HOODIE Oversfit", "keek Neck Cushion",
    "Filovely Logo Tee", "keek Pillow U V2", "Recovery Band", "Travel Organizer",
    "keek Hoodie Zip-up", "Filovely Utility Vest",
]
MOCK_CRM_CHANNELS = ["sms", "alimtalk", "kakao", "reviews"]


class Cafe24Collector(BaseCollector):
    source = "cafe24"

    def _category_names(self) -> list[str]:
        for g in self.config.metrics.daily_groups:
            if g.get("name") == "카테고리 매출":
                return list(g.get("metrics", []))
        return ["All", "BEST", "NEW"]

    def collect_mock(self, date: str) -> list[dict]:
        r = _rng(date)
        visitors = r.randint(800, 2500)
        conv = r.uniform(0.008, 0.020)              # 구매전환율
        order_count = max(1, round(visitors * conv))
        aov = r.randint(80_000, 150_000)            # 객단가
        gross_sales = order_count * aov
        ad_cost = round(gross_sales * r.uniform(0.05, 0.40))
        ad_sales = round(gross_sales * r.uniform(0.20, 0.60))
        new_visitors = round(visitors * r.uniform(0.55, 0.80))   # 신규방문
        new_signups = round(order_count * r.uniform(0.3, 1.2))   # 신규가입수

        values = {
            "gross_sales": float(gross_sales),
            "ad_sales": float(ad_sales),
            "order_count": float(order_count),
            "aov": float(aov),
            "conversion_rate": round(order_count / visitors * 100, 2),  # %
            "visitors": float(visitors),
            "visitors_new": float(new_visitors),                 # 신규방문
            "visitors_returning": float(visitors - new_visitors),  # 재방문
            "new_signups": float(new_signups),                   # 신규가입수
            "ad_cost": float(ad_cost),
            "ad_cost_ratio": round(ad_cost / gross_sales * 100, 2),     # %
        }
        facts = [
            {"date": date, "source": self.source, "metric": k, "value": v}
            for k, v in values.items()
        ]
        facts += self._dimensional_mock(date, r, gross_sales, order_count)
        return facts

    def _dimensional_mock(self, date, r, gross_sales, order_count) -> list[dict]:
        """일별 운영 데이터 상세용 차원 팩트(디바이스/신규·재구매/카테고리/베스트/CRM)."""
        out: list[dict] = []

        def f(metric, value, **dims):
            out.append({"date": date, "source": self.source, "metric": metric,
                        "value": float(value), "dims": dims})

        # 디바이스 매출 비중(+ 주문건수 — 매출 비중과 동일 비율로 근사)
        mobile_share = r.uniform(0.55, 0.80)
        mobile = round(gross_sales * mobile_share)
        f("device_sales", mobile, device="mobile")
        f("device_sales", gross_sales - mobile, device="pc")
        mobile_orders = round(order_count * mobile_share)
        f("device_order_count", mobile_orders, device="mobile")
        f("device_order_count", order_count - mobile_orders, device="pc")

        # 신규 vs 재구매 매출
        new_sales = round(gross_sales * r.uniform(0.30, 0.60))
        f("customer_sales", new_sales, customer_type="new")
        f("customer_sales", gross_sales - new_sales, customer_type="returning")

        # 카테고리 매출
        for cat in self._category_names():
            f("category_sales", round(gross_sales * r.uniform(0.05, 0.45)), category=cat)

        # 베스트 상품
        for name in MOCK_PRODUCTS:
            f("product_sales", r.randint(200_000, 3_000_000), product=name)

        # CRM 발송/후기
        for ch in MOCK_CRM_CHANNELS:
            base = order_count * r.uniform(0.5, 3.0)
            f("crm_count", round(base), channel=ch)

        return out

    def collect_live(self, date: str) -> list[dict]:
        from ..clients import Cafe24Client
        from ..store import Store

        # DB 에 영속된 토큰을 최우선 사용(무인 환경 토큰 회전 대응). 없으면 env 폴백.
        kv = Store(self.config.data_dir)
        try:
            access = kv.get_kv("cafe24_access_token")
            refresh = kv.get_kv("cafe24_refresh_token")
            client = Cafe24Client.from_config(
                self.config, access_override=access, refresh_override=refresh
            )
            try:
                orders = client.list_orders(date, date)
                count = client.count_orders(date, date)
                # 방문자수: GA4 우선(설정 시), 없으면 카페24 경로 폴백(둘 다 없으면 None).
                # GA4 클라이언트/토큰은 프로세스당 1회만 생성(백필 시 매일 재발급 방지).
                if not hasattr(self, "_ga4"):
                    from ..clients.ga4 import GA4Client
                    self._ga4 = GA4Client.from_env()
                seg = None
                if self._ga4 is not None:
                    visitors = self._ga4.daily_visitors(date)
                    seg = self._ga4.daily_new_returning(date)  # 신규/재방문 세그먼트
                else:
                    visitors = client.get_visitor_count(date)  # CAFE24_VISITORS_PATH 설정 시
                signups = client.count_new_customers(date, date)
                reviews = client.count_reviews(date, date)   # 상품후기 수(board 4)
                soldout = client.count_soldout()             # 현재 품절 상품 수(스냅샷)
                # 상품→카테고리 매핑: DB 캐시 우선(매 수집마다 재구축 → cafe24 429 방지).
                # 프로세스당 1회 로드/구축하고, 새로 만들면 DB(app_kv)에 영속해 재사용.
                # 강제 갱신: CAFE24_REFRESH_CATEGORY_MAP=1
                if getattr(self, "_catmap", None) is None:
                    import json as _json
                    import os as _os
                    cached = kv.get_kv("category_map")
                    if cached and _os.environ.get("CAFE24_REFRESH_CATEGORY_MAP") != "1":
                        try:
                            parsed = {int(k): v for k, v in _json.loads(cached).items()}
                            # 빈 맵(과거 429로 비어 저장됨)은 무시하고 재구축(자가치유)
                            self._catmap = parsed or None
                        except (ValueError, TypeError):
                            self._catmap = None
                    if not getattr(self, "_catmap", None):
                        self._catmap = build_category_map(client)
                        if self._catmap:
                            kv.set_kv("category_map", _json.dumps(
                                {str(k): v for k, v in self._catmap.items()},
                                ensure_ascii=False))
            finally:
                client.close()
            # 갱신(회전)되었을 수 있는 토큰을 DB 에 저장 → 다음 실행이 이어받음
            kv.set_kv("cafe24_access_token", client.access_token)
            if client.refresh_token:
                kv.set_kv("cafe24_refresh_token", client.refresh_token)
        finally:
            kv.close()
        extra = []
        if reviews is not None:
            extra.append({"date": date, "source": "cafe24", "metric": "crm_count",
                          "value": float(reviews), "dims": {"channel": "reviews"}})
        if soldout is not None:
            extra.append({"date": date, "source": "cafe24", "metric": "soldout_count",
                          "value": float(soldout)})
        return (
            orders_to_metrics(date, orders, count)
            + visitor_metrics(date, count, visitors)
            + visitor_segment_metrics(date, seg)
            + signup_metrics(date, signups)
            + order_breakdowns(date, orders)
            + best_products(date, orders)
            + category_sales(date, orders, getattr(self, "_catmap", None) or {})
            + extra
        )
