"""알림 — 이상치/Top 소재/경쟁사 변화 감지.

저장된 데이터로부터 운영자가 바로 볼만한 신호를 만든다.
scripts/notify.py 가 이 함수들을 호출해 출력/푸시한다.
"""
from __future__ import annotations

from datetime import date as _date
from datetime import timedelta

from .etl.competitor_metrics import competitor_snapshot
from .etl.creative_metrics import creatives_ranked


def sales_anomaly(store, date: str, drop_pct: float = 30.0) -> dict | None:
    """당일 매출을 최근 7일 평균과 비교해 급락/급증을 감지."""
    base = _date.fromisoformat(date)
    w_from = (base - timedelta(days=7)).isoformat()
    w_to = (base - timedelta(days=1)).isoformat()
    prior = [r["value"] for r in store.get_daily(w_from, w_to) if r["metric"] == "gross_sales"]
    today = store.get_kpi(date).get("gross_sales")
    if today is None or not prior:
        return None
    avg = sum(prior) / len(prior)
    if avg <= 0:
        return None
    change = (today - avg) / avg * 100
    if change <= -drop_pct:
        return {"level": "warning", "type": "sales_drop",
                "message": f"매출이 최근 7일 평균 대비 {change:.0f}% 하락 (₩{today:,.0f})",
                "value": round(change, 1)}
    if change >= drop_pct * 2:
        return {"level": "info", "type": "sales_spike",
                "message": f"매출 급증 +{change:.0f}% (₩{today:,.0f})",
                "value": round(change, 1)}
    return None


def top_creative_alert(store, date: str) -> dict | None:
    items = creatives_ranked(store, date, top_n=1, sort="roas")
    if not items or items[0]["roas"] is None:
        return None
    c = items[0]
    return {"level": "info", "type": "top_creative",
            "message": f"최고 성과 소재: {c['name']} (ROAS {c['roas']}x, {c['channel']})"}


def competitor_alerts(store, date: str) -> list[dict]:
    base = _date.fromisoformat(date)
    prev = (base - timedelta(days=1)).isoformat()
    today = {c["name"]: c for c in competitor_snapshot(store, date)}
    yest = {c["name"]: c for c in competitor_snapshot(store, prev)}
    out = []
    for name, c in today.items():
        p = yest.get(name)
        cur, old = c.get("active_promotions"), (p or {}).get("active_promotions")
        if p and cur is not None and old is not None and cur > old:
            out.append({"level": "info", "type": "competitor_promo",
                        "message": f"{name} 프로모션 증가 {int(old)}→{int(cur)}건"})
    return out


def _pct_vs_7d_avg(store, date: str) -> float | None:
    base = _date.fromisoformat(date)
    prior = [r["value"] for r in store.get_daily(
        (base - timedelta(days=7)).isoformat(), (base - timedelta(days=1)).isoformat())
        if r["metric"] == "gross_sales"]
    today = store.get_kpi(date).get("gross_sales")
    if today is None or not prior:
        return None
    avg = sum(prior) / len(prior)
    return (today - avg) / avg * 100 if avg > 0 else None


def build_digest(store, date: str) -> list[str]:
    """하루 핵심 요약(아침 브리핑) — 대시보드 안 봐도 한눈에. 사람이 읽는 라인 목록."""
    from .etl.ads_metrics import ads_summary
    from .etl.breakdown import (
        best_products, category_breakdown, crm_counts, device_breakdown, new_returning_trend,
    )

    k = store.get_kpi(date)
    gross, oc, aov = k.get("gross_sales"), k.get("order_count"), k.get("aov")
    lines: list[str] = []
    if gross is not None:
        chg = _pct_vs_7d_avg(store, date)
        chg_s = f" ({chg:+.0f}% vs 7일평균)" if chg is not None else ""
        lines.append(f"💰 매출 ₩{gross:,.0f} · 주문 {oc or 0:,.0f}건 · 객단가 ₩{aov or 0:,.0f}{chg_s}")

    vis, cr = k.get("visitors"), k.get("conversion_rate")
    if vis:
        cr_s = f" · 전환율 {cr:.2f}%" if cr is not None else ""
        lines.append(f"👀 방문자 {vis:,.0f}{cr_s}")

    dev = {d["key"]: d["value"] for d in device_breakdown(store, date)}
    dtot = sum(dev.values())
    if dtot > 0:
        lines.append(f"📱 모바일 {dev.get('mobile', 0) / dtot * 100:.0f}% · "
                     f"PC {dev.get('pc', 0) / dtot * 100:.0f}%")

    nr = new_returning_trend(store, date, date)
    if nr:
        n, r = nr[0]["new"], nr[0]["returning"]
        if n + r > 0:
            lines.append(f"👥 신규 {n / (n + r) * 100:.0f}% · 재구매 {r / (n + r) * 100:.0f}%")

    cats = category_breakdown(store, date)[:3]
    if cats:
        lines.append("🏷️ 카테고리 " + ", ".join(f"{c['key']} ₩{c['value']:,.0f}" for c in cats))

    bp = best_products(store, date, top_n=3)
    if bp:
        lines.append("🏆 베스트 " + ", ".join(str(c["key"]) for c in bp))

    a = ads_summary(store, date)
    if a.get("ad_cost"):
        roas, share = a.get("roas"), a.get("ad_share")
        lines.append(f"📣 광고비 ₩{a['ad_cost']:,.0f} · ROAS {roas if roas is not None else '—'}"
                     f"{f' · 매출대비 {share}%' if share is not None else ''}")

    crm = crm_counts(store, date)
    if crm.get("reviews"):
        lines.append(f"📝 후기 {crm['reviews']:,.0f}건")
    soldout = sum(float(r["value"]) for r in store.get_facts(date, date, metric="soldout_count"))
    if soldout:
        lines.append(f"⛔ 품절 {soldout:,.0f}개")
    return lines


# ── 전문 분석 코멘트(오늘의 브리핑) ────────────────────────────────────
_CORE = [
    ("gross_sales", "매출"),
    ("order_count", "주문건수"),
    ("aov", "객단가"),
    ("conversion_rate", "구매전환율"),
    ("visitors", "방문자"),
]


def _won(v):
    return f"₩{v:,.0f}" if v is not None else "—"


def _fmt_metric(key: str, v) -> str:
    if v is None:
        return "—"
    if key in ("gross_sales", "aov", "ad_cost", "ad_sales", "cpc"):
        return f"₩{v:,.0f}"
    if key in ("conversion_rate", "ad_cost_ratio", "ctr", "cvr", "ad_share"):
        return f"{v:.2f}%"
    if key == "roas":
        return f"{v}x"
    return f"{v:,.0f}"


def _delta_pct(cur, base):
    if cur is None or base in (None, 0):
        return None
    return round((cur - base) / base * 100, 1)


def _delta_str(p) -> str:
    if p is None:
        return "—"
    return f"{'+' if p >= 0 else '−'}{abs(p):.0f}%"


def _minus_year(date: str) -> str:
    y, m, d = (int(x) for x in date.split("-"))
    try:
        return _date(y - 1, m, d).isoformat()
    except ValueError:  # 2/29 → 전년 2/28
        return _date(y - 1, m, d - 1).isoformat()


def _avg_map(store, date: str) -> dict:
    """직전 7일(당일 제외) 지표별 평균."""
    base = _date.fromisoformat(date)
    rows = store.get_daily(
        (base - timedelta(days=7)).isoformat(), (base - timedelta(days=1)).isoformat())
    agg: dict[str, list] = {}
    for r in rows:
        agg.setdefault(r["metric"], []).append(r["value"])
    return {k: sum(v) / len(v) for k, v in agg.items() if v}


def build_commentary(store, date: str) -> dict:
    """오늘의 브리핑 전문 분석 코멘트.

    - core: 핵심지표 전일/전주/전년 동일 대비 변화
    - movers: 7일 평균 대비 크게 오르내린 지표(±15% 이상)
    - anomalies: 평균 이탈·신규 등장(품절/카테고리/소재)
    - ads: 광고 지표 당일/전일/전주 비교(별도 분리)
    """
    from .etl.breakdown import category_breakdown
    from .etl.ads_metrics import ads_summary_range

    base = _date.fromisoformat(date)
    prev_d = (base - timedelta(days=1)).isoformat()
    prev_w = (base - timedelta(days=7)).isoformat()
    prev_y = _minus_year(date)

    k = store.get_kpi(date)
    kp, kw, ky = store.get_kpi(prev_d), store.get_kpi(prev_w), store.get_kpi(prev_y)
    avg = _avg_map(store, date)
    if not k:
        return {"headline": "", "core": [], "movers": [], "anomalies": [], "ads": []}

    # 1) 핵심지표 전일/전주/전년 대비
    core: list[str] = []
    for key, label in _CORE:
        cur = k.get(key)
        if cur is None:
            continue
        parts = [f"전일 {_delta_str(_delta_pct(cur, kp.get(key)))}",
                 f"전주 {_delta_str(_delta_pct(cur, kw.get(key)))}"]
        if ky.get(key) is not None:
            parts.append(f"전년 {_delta_str(_delta_pct(cur, ky.get(key)))}")
        core.append(f"{label} {_fmt_metric(key, cur)} — " + " · ".join(parts))

    # 2) 7일 평균 대비 급등락(±15%)
    moves = []
    for key, label in _CORE:
        p = _delta_pct(k.get(key), avg.get(key))
        if p is not None and abs(p) >= 15:
            moves.append((abs(p), p, label))
    moves.sort(reverse=True)
    movers = [f"{label} 7일 평균 대비 {_delta_str(p)} {'상승' if p > 0 else '하락'}"
              for _, p, label in moves]
    if not movers:
        movers = ["핵심 지표 모두 7일 평균 ±15% 이내로 특이 급변 없음"]

    # 3) 이상치 / 신규 등장
    anomalies: list[str] = []
    #   품절 급변
    so_today = sum(float(r["value"]) for r in store.get_facts(date, date, metric="soldout_count"))
    so_prior = [sum(float(r["value"]) for r in store.get_facts(d, d, metric="soldout_count"))
                for d in [(base - timedelta(days=i)).isoformat() for i in range(1, 8)]]
    so_prior = [x for x in so_prior if x]
    if so_today and so_prior:
        so_avg = sum(so_prior) / len(so_prior)
        sp = _delta_pct(so_today, so_avg)
        if sp is not None and abs(sp) >= 20:
            anomalies.append(f"품절 {so_today:,.0f}개 — 평균 대비 {_delta_str(sp)} "
                             f"{'급증' if sp > 0 else '감소'}")
    #   신규 카테고리(직전 7일 없던 카테고리에 매출 발생)
    cats_today = {c["key"] for c in category_breakdown(store, date)}
    cats_prior: set = set()
    for i in range(1, 8):
        d = (base - timedelta(days=i)).isoformat()
        cats_prior |= {c["key"] for c in category_breakdown(store, d)}
    new_cats = [c for c in cats_today - cats_prior if c and c != "기타"]
    if new_cats:
        anomalies.append("신규 카테고리 매출 발생: " + ", ".join(sorted(new_cats)[:4]))
    #   신규 광고 소재(직전 7일 없던 소재가 오늘 등장)
    def _cids(d0, d1):
        return {r["dims"].get("creative_id") for r in store.get_facts(d0, d1, source="creative")
                if r["dims"].get("creative_id")}
    new_creatives = _cids(date, date) - _cids(prev_w, prev_d)
    if new_creatives:
        anomalies.append(f"신규 광고 소재 {len(new_creatives)}건 첫 집행")
    #   핵심지표 결측
    missing = [label for key, label in _CORE if k.get(key) is None]
    if missing:
        anomalies.append("데이터 결측: " + ", ".join(missing) + " (수집/연동 점검)")

    # 4) 광고 지표 — 당일 / 전일 / 전주 (별도 분리)
    def _with_cpc(s):
        if s:
            s = dict(s)
            s["cpc"] = round(s["ad_cost"] / s["clicks"]) if s.get("clicks") else None
        return s or {}
    at, ap, aw = (_with_cpc(ads_summary_range(store, d, d)) for d in (date, prev_d, prev_w))
    ads: list[str] = []
    if at.get("ad_cost"):
        for key, label in [("ad_cost", "광고비"), ("ad_sales", "광고매출"), ("roas", "ROAS"),
                           ("ctr", "CTR"), ("cpc", "CPC"), ("ad_share", "매출대비")]:
            cur = at.get(key)
            if cur is None:
                continue
            dp = _delta_str(_delta_pct(cur, ap.get(key)))
            dw = _delta_str(_delta_pct(cur, aw.get(key)))
            ads.append(f"{label} {_fmt_metric(key, cur)} — 전일 {dp} · 전주 {dw}")

    # 5) 헤드라인(임원 요약)
    gp = _delta_pct(k.get("gross_sales"), avg.get("gross_sales"))
    tone = "호조" if (gp or 0) >= 10 else ("부진" if (gp or 0) <= -10 else "보합")
    head = f"매출 {_won(k.get('gross_sales'))}"
    if gp is not None:
        head += f", 7일 평균 대비 {_delta_str(gp)}로 {tone}"
    cr = k.get("conversion_rate")
    crp = _delta_pct(cr, avg.get("conversion_rate"))
    if cr is not None and crp is not None:
        head += f" · 전환율 {cr:.2f}%({_delta_str(crp)})"
    roas = at.get("roas")
    if roas is not None:
        head += f" · 광고 ROAS {roas}x"

    return {"headline": head, "core": core, "movers": movers,
            "anomalies": anomalies, "ads": ads}


def collection_health_alert(store, date: str) -> dict | None:
    """수집 실패 자가감지 — 해당 일자에 오류로 빠진 채널이 있으면 경고(무인 운영 보호)."""
    import json
    raw = store.get_kv(f"collect_status:{date}")
    if not raw:
        return None
    try:
        status = json.loads(raw)
    except (ValueError, TypeError):
        return None
    errors = status.get("errors") or {}
    if not errors:
        return None
    chans = ", ".join(sorted(errors))
    return {"level": "warning", "type": "collect_error",
            "message": f"수집 실패 채널: {chans} (토큰/연동 점검 필요)"}


def build_alerts(store, date: str) -> list[dict]:
    alerts: list[dict] = []
    for fn in (sales_anomaly, top_creative_alert, collection_health_alert):
        a = fn(store, date)
        if a:
            alerts.append(a)
    alerts.extend(competitor_alerts(store, date))
    return alerts
