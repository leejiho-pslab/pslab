"""월간 비교 리포트 — 두 달치 매출/광고/키워드 집계 + 자동 코멘터리.

데이터(표·증감)는 facts/kpi_daily 에서 자동 계산하고, 좋아진/아쉬운·해석·전략 초안은
규칙으로 생성한다. 전략은 사람이 편집하는 영역이라 '초안'으로 제공 — 양식은 고정.
keek 은 자사몰 실매출이 있는 이커머스라 매출·ROAS 를 중심 지표로 삼는다
(리드젠 업체용 CPA 중심 리포트와는 지표 구성이 다름 — dbrick-ads-status 참고).
"""
from __future__ import annotations

import calendar

from .ads_metrics import ads_channels_range, ads_summary_range
from .keyword_metrics import keyword_report_range

CH_LABEL = {
    "meta": "Meta", "naver_powerlink": "네이버 파워링크", "naver_place": "네이버 플레이스",
    "naver": "네이버", "naver_other": "네이버 기타", "google": "Google", "kakao": "Kakao",
}


def month_range(ym: str) -> tuple[str, str]:
    y, m = (int(x) for x in ym.split("-"))
    return f"{y:04d}-{m:02d}-01", f"{y:04d}-{m:02d}-{calendar.monthrange(y, m)[1]:02d}"


def prev_month(ym: str) -> str:
    y, m = (int(x) for x in ym.split("-"))
    return f"{y-1:04d}-12" if m == 1 else f"{y:04d}-{m-1:02d}"


def _shop_summary(store, d0: str, d1: str) -> dict:
    sums: dict[str, float] = {}
    for r in store.get_daily(d0, d1):
        sums[r["metric"]] = sums.get(r["metric"], 0.0) + r["value"]
    gross = sums.get("gross_sales", 0.0)
    orders = sums.get("order_count", 0.0)
    visitors = sums.get("visitors", 0.0)
    return {
        "gross_sales": gross, "order_count": orders, "visitors": visitors,
        "aov": round(gross / orders) if orders else None,
        "conversion_rate": round(orders / visitors * 100, 2) if visitors else None,
    }


def _pct(cur, prev) -> float | None:
    if cur is None or prev in (None, 0):
        return None
    return round((cur - prev) / prev * 100, 1)


def _pp(cur, prev) -> float | None:
    if cur is None or prev is None:
        return None
    return round(cur - prev, 2)


def _month_block(store, ym: str) -> dict:
    d0, d1 = month_range(ym)
    ads = ads_summary_range(store, d0, d1)
    channels = ads_channels_range(store, d0, d1)
    kw = keyword_report_range(store, d0, d1, channel="naver_powerlink", sort="ad_cost")
    return {
        "month": ym, "from": d0, "to": d1,
        "shop": _shop_summary(store, d0, d1),
        "ads": ads, "channels": channels,
        "top_keywords": kw["keywords"][:6],
    }


def _fmt_won(v):
    return "—" if v is None else f"₩{round(v):,}"


def _fmt_num(v):
    return "—" if v is None else f"{round(v):,}"


def _fmt_pct(v):
    return "—" if v is None else f"{v}%"


def _fmt_roas(v):
    return "—" if v is None else f"{v}x"


def _delta_str(pct, positive_good=True, unit="%"):
    """증감 문자열 + 방향(good/bad/flat). CPC 는 낮을수록 좋음(positive_good=False)."""
    if pct is None:
        return {"text": "—", "dir": "flat"}
    good = (pct >= 0) == positive_good
    arrow = "▲" if pct > 0 else ("▼" if pct < 0 else "·")
    d = "flat" if abs(pct) < 0.05 else ("good" if good else "bad")
    return {"text": f"{arrow} {abs(pct)}{unit}", "dir": d, "pct": pct}


def monthly_report_data(store, target: str) -> dict:
    """target(YYYY-MM) 월 vs 전월 비교 데이터 + 자동 코멘터리."""
    cmp_m = prev_month(target)
    b = _month_block(store, target)   # 대상(최근)
    a = _month_block(store, cmp_m)    # 비교(전월)
    sb, sa = b["shop"], a["shop"]
    ab, aa = b["ads"], a["ads"]

    # ── 01 한 장 요약 표 ──────────────────────────────────
    kpi_rows = [
        {"label": "매출", "a": _fmt_won(sa["gross_sales"]), "b": _fmt_won(sb["gross_sales"]),
         "delta": _delta_str(_pct(sb["gross_sales"], sa["gross_sales"]))},
        {"label": "광고비", "a": _fmt_won(aa["ad_cost"]), "b": _fmt_won(ab["ad_cost"]),
         "delta": _delta_str(_pct(ab["ad_cost"], aa["ad_cost"]))},
        {"label": "광고 매출", "a": _fmt_won(aa["ad_sales"]), "b": _fmt_won(ab["ad_sales"]),
         "delta": _delta_str(_pct(ab["ad_sales"], aa["ad_sales"]))},
        {"label": "ROAS", "a": _fmt_roas(aa["roas"]), "b": _fmt_roas(ab["roas"]),
         "delta": _delta_str(_pct(ab["roas"], aa["roas"]))},
        {"label": "주문건수", "a": f'{_fmt_num(sa["order_count"])} 건', "b": f'{_fmt_num(sb["order_count"])} 건',
         "delta": _delta_str(_pct(sb["order_count"], sa["order_count"]))},
        {"label": "객단가", "a": _fmt_won(sa["aov"]), "b": _fmt_won(sb["aov"]),
         "delta": _delta_str(_pct(sb["aov"], sa["aov"]))},
        {"label": "구매전환율", "a": _fmt_pct(sa["conversion_rate"]), "b": _fmt_pct(sb["conversion_rate"]),
         "delta": _delta_str(_pp(sb["conversion_rate"], sa["conversion_rate"]), unit="%p")},
        {"label": "방문자", "a": _fmt_num(sa["visitors"]), "b": _fmt_num(sb["visitors"]),
         "delta": _delta_str(_pct(sb["visitors"], sa["visitors"]))},
    ]

    # ── 03 매체별 비교 표 ─────────────────────────────────
    amap = {c["channel"]: c for c in a["channels"]}
    channel_rows = []
    for c in b["channels"]:
        pa = amap.get(c["channel"], {})
        channel_rows.append({
            "channel": CH_LABEL.get(c["channel"], c["channel"]),
            "ad_cost": _fmt_won(c["ad_cost"]), "ad_cost_d": _delta_str(_pct(c["ad_cost"], pa.get("ad_cost"))),
            "impressions": _fmt_num(c["impressions"]), "impressions_d": _delta_str(_pct(c["impressions"], pa.get("impressions"))),
            "clicks": _fmt_num(c["clicks"]), "clicks_d": _delta_str(_pct(c["clicks"], pa.get("clicks"))),
            "ctr": _fmt_pct(c["ctr"]), "ctr_d": _delta_str(_pp(c["ctr"], pa.get("ctr")), unit="%p"),
            "cpc": _fmt_won(c["cpc"]), "cpc_d": _delta_str(_pct(c["cpc"], pa.get("cpc")), positive_good=False),
            "ad_sales": _fmt_won(c["ad_sales"]),
            "roas": _fmt_roas(c["roas"]), "roas_d": _delta_str(_pct(c["roas"], pa.get("roas"))),
        })

    # ── 02 좋아진 / 아쉬운 (규칙) ─────────────────────────
    improved, declined = [], []
    dsales = _pct(sb["gross_sales"], sa["gross_sales"])
    dcost = _pct(ab["ad_cost"], aa["ad_cost"])
    droas = _pct(ab["roas"], aa["roas"])
    dctr = _pp(ab["ctr"], aa["ctr"])
    dcvr_shop = _pp(sb["conversion_rate"], sa["conversion_rate"])
    if dsales is not None and dsales > 0:
        eff = " — 광고비 증가율보다 매출 증가율이 높아 효율 개선" if (dcost is not None and dsales > dcost) else ""
        improved.append(f'매출 {_fmt_won(sa["gross_sales"])} → {_fmt_won(sb["gross_sales"])} (+{dsales}%){eff}')
    if droas is not None and droas > 0:
        improved.append(f'ROAS {_fmt_roas(aa["roas"])} → {_fmt_roas(ab["roas"])} (+{droas}%) — 광고 1원당 매출 효율 개선')
    meta_b = next((c for c in b["channels"] if c["channel"] == "meta"), None)
    meta_a = amap.get("meta")
    if meta_b and meta_a:
        mcpc = _pct(meta_b["cpc"], meta_a["cpc"])
        if mcpc is not None and mcpc < 0:
            improved.append(f"Meta 클릭단가(CPC) {mcpc}% 하락 — 노출·클릭 효율 개선")
    dimp = _pct(ab["impressions"], aa["impressions"])
    if dimp is not None and dimp > 15:
        improved.append(f"도달 규모 확대 — 노출 +{dimp}% · 클릭 +{_pct(ab['clicks'], aa['clicks'])}%")
    if dcvr_shop is not None and dcvr_shop < -0.05:
        declined.append(f'구매전환율 {_fmt_pct(sa["conversion_rate"])} → {_fmt_pct(sb["conversion_rate"])} ({dcvr_shop}%p) — 유입 확대 대비 전환이 못 따라옴(희석)')
    if dctr is not None and dctr < -0.05:
        declined.append(f'CTR {_fmt_pct(aa["ctr"])} → {_fmt_pct(ab["ctr"])} ({dctr}%p) — 소재 피로 신호, 신규 소재 로테이션 필요')
    # 채널 중 ROAS 가 뚜렷이 하락한 곳(예산이 있는 채널만)
    for c in b["channels"]:
        pa = amap.get(c["channel"])
        if not pa or not c["ad_cost"]:
            continue
        cd = _pct(c["roas"], pa.get("roas"))
        if cd is not None and cd <= -20:
            declined.append(f'{CH_LABEL.get(c["channel"], c["channel"])} ROAS {_fmt_roas(pa.get("roas"))} → {_fmt_roas(c["roas"])} ({cd}%) — 소재/타겟 점검 필요')
    if not improved:
        improved.append("전월 대비 뚜렷한 개선 지표가 제한적 — 데이터 누적 후 재평가 권장")
    if not declined:
        declined.append("전월 대비 뚜렷한 악화 지표 없음")

    # ── 해석 / 키워드 / 전략 초안 ─────────────────────────
    meta_share = round(meta_b["budget_share"], 1) if meta_b else 0
    top_ch = max(b["channels"], key=lambda c: c["ad_cost"], default=None)
    interpretation = (
        f"{CH_LABEL.get(top_ch['channel'], top_ch['channel']) if top_ch else 'Meta'}가 예산 비중이 가장 커 계정 성과의 중심입니다"
        f"(Meta 비중 {meta_share}%). 채널별 ROAS 격차를 매월 비교해 예산을 효율 높은 채널로 재배분하는 것이 핵심입니다.")
    kw = b["top_keywords"]
    keyword_note = ""
    if kw:
        top = kw[0]
        keyword_note = (f"‘{top['keyword']}’ 키워드가 파워링크 예산의 큰 비중을 차지합니다"
                        f"(광고비 {_fmt_won(top['ad_cost'])}, 클릭 {_fmt_num(top['clicks'])}, CTR {_fmt_pct(top['ctr'])}). "
                        "전환 기여도를 확인해 확대·축소를 판단하세요.")

    strategy_draft = [
        {"title": "ROAS 개선 채널에 예산을 더 싣는다 [최우선]",
         "body": "채널별 ROAS 를 비교해 효율 좋은 채널(주로 Meta/네이버 파워링크)에 완만히 증액하고, "
                 "목표 ROAS 하한선을 정해 주 단위로 모니터링합니다."},
        {"title": "랜딩·결제 퍼널 점검으로 전환율을 방어한다",
         "body": "유입이 늘 때 전환율이 희석되지 않도록 상품 상세·장바구니·결제 단계의 이탈을 점검합니다."},
        {"title": "소재 리프레시로 CTR 피로를 회복한다",
         "body": "신규 소재 2~3종을 로테이션하고, 베스트셀러·후기 중심 비주얼을 전면에 세웁니다."},
        {"title": "검색 키워드를 데이터로 재편한다",
         "body": "예산이 편중된 키워드를 점검하고, 전환으로 이어지는 키워드로 재분배합니다."},
        {"title": "재구매·CRM 활용으로 객단가를 방어한다",
         "body": "재구매 고객 비중과 객단가 추이를 모니터링하고, 번들·업셀 구성으로 평균 주문가를 끌어올립니다."},
    ]

    return {
        "target": target, "compare": cmp_m,
        "target_label": target.replace("-", "년 ") + "월", "compare_label": cmp_m.replace("-", "년 ") + "월",
        "headline": _headline(dsales, dcost, droas),
        "kpi_rows": kpi_rows, "channel_rows": channel_rows,
        "improved": improved, "declined": declined,
        "interpretation": interpretation, "keyword_note": keyword_note,
        "top_keywords": [
            {"keyword": k["keyword"], "campaign": k.get("adgroup"), "ad_cost": _fmt_won(k["ad_cost"]),
             "clicks": _fmt_num(k["clicks"]), "ctr": _fmt_pct(k["ctr"]), "cpc": _fmt_won(k["cpc"])}
            for k in kw
        ],
        "strategy_draft": strategy_draft,
        "raw": {"a": {**sa, **aa}, "b": {**sb, **ab}},
    }


def _headline(dsales, dcost, droas) -> str:
    parts = []
    if dsales is not None:
        parts.append(f"매출 {'+' if dsales >= 0 else ''}{dsales}%")
    if dcost is not None:
        parts.append(f"광고비 {'+' if dcost >= 0 else ''}{dcost}%")
    if droas is not None:
        parts.append(f"ROAS {'+' if droas >= 0 else ''}{droas}%{'(개선)' if droas > 0 else ''}")
    if not parts:
        return "전월 대비 성과 요약 — 데이터 누적 후 지표가 채워집니다."
    return "전월 대비 " + " · ".join(parts) + "."


def latest_complete_month(store) -> str:
    """'지난달'(완결된 최근 월)을 YYYY-MM 으로 — 오늘(KST) 기준 전월.
    매월 1일이면 자동으로 방금 끝난 달이 잡힌다. 그 달에 데이터가 없으면
    데이터가 있는(이번 달 제외) 가장 최근 월로 폴백한다."""
    from datetime import datetime, timedelta, timezone

    today = datetime.now(timezone(timedelta(hours=9))).date()
    cur = f"{today.year:04d}-{today.month:02d}"
    cand = prev_month(cur)
    have = {d[:7] for d in store.list_dates()}
    if not have or cand in have:
        return cand
    for mth in sorted(have, reverse=True):
        if mth != cur:
            return mth
    return cand
