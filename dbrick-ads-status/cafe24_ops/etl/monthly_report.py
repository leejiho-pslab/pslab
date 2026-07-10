"""월간 비교 리포트 — 두 달치 광고/GA4/키워드 집계 + 자동 코멘터리(리드젠 기준).

데이터(표·증감)는 facts 에서 자동 계산하고, 좋아진/아쉬운·해석·전략 초안은 규칙으로 생성한다.
전략은 사람이 편집하는 영역이라 '초안'으로 제공(대표님이 매월 수정) — 양식은 고정.
매출/ROAS 는 리드젠에서 무의미해 다루지 않고 결과(문의)·CPA·CPC·CTR·CVR 로 판단한다.
"""
from __future__ import annotations

import calendar

from .ads_metrics import ads_channels_range, ads_summary_range
from .ga4_site import site_summary
from .keyword_metrics import keyword_report

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


def _cpa(cost: float, conv: float) -> float | None:
    return round(cost / conv) if conv else None


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
    summary = ads_summary_range(store, d0, d1)
    summary["cpa"] = _cpa(summary["ad_cost"], summary["conversions"])
    summary["cpc"] = _cpa(summary["ad_cost"], summary["clicks"])
    channels = ads_channels_range(store, d0, d1)
    return {
        "month": ym, "from": d0, "to": d1, "summary": summary, "channels": channels,
        "ga4_site": site_summary(store, d0, d1),
        "top_keywords": keyword_report(store, d0, d1, channel="naver_powerlink",
                                       sort="ad_cost", top_n=6),
    }


def _fmt_won(v):
    return "—" if v is None else f"₩{round(v):,}"


def _fmt_num(v):
    return "—" if v is None else f"{round(v):,}"


def _fmt_pct(v):
    return "—" if v is None else f"{v}%"


def _delta_str(pct, positive_good=True, unit="%"):
    """증감 문자열 + 방향(good/bad/flat). CPA/CPC 는 낮을수록 좋음(positive_good=False)."""
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
    sb, sa = b["summary"], a["summary"]

    # ── 01 한 장 요약 표 ──────────────────────────────────
    kpi_rows = [
        {"label": "총 광고비", "a": _fmt_won(sa["ad_cost"]), "b": _fmt_won(sb["ad_cost"]),
         "delta": _delta_str(_pct(sb["ad_cost"], sa["ad_cost"]))},
        {"label": "결과 (문의·전환)", "a": f'{_fmt_num(sa["conversions"])} 건', "b": f'{_fmt_num(sb["conversions"])} 건',
         "delta": _delta_str(_pct(sb["conversions"], sa["conversions"]))},
        {"label": "전환당 비용 (CPA)", "a": _fmt_won(sa["cpa"]), "b": _fmt_won(sb["cpa"]),
         "delta": _delta_str(_pct(sb["cpa"], sa["cpa"]), positive_good=False)},
        {"label": "노출", "a": _fmt_num(sa["impressions"]), "b": _fmt_num(sb["impressions"]),
         "delta": _delta_str(_pct(sb["impressions"], sa["impressions"]))},
        {"label": "클릭", "a": _fmt_num(sa["clicks"]), "b": _fmt_num(sb["clicks"]),
         "delta": _delta_str(_pct(sb["clicks"], sa["clicks"]))},
        {"label": "CTR (클릭률)", "a": _fmt_pct(sa["ctr"]), "b": _fmt_pct(sb["ctr"]),
         "delta": _delta_str(_pp(sb["ctr"], sa["ctr"]), unit="%p")},
        {"label": "CVR (전환율)", "a": _fmt_pct(sa["cvr"]), "b": _fmt_pct(sb["cvr"]),
         "delta": _delta_str(_pp(sb["cvr"], sa["cvr"]), unit="%p")},
        {"label": "사이트 방문 (GA4)", "a": _fmt_num(a["ga4_site"]["visitors"] or None),
         "b": _fmt_num(b["ga4_site"]["visitors"] or None), "delta": _delta_str(_pct(b["ga4_site"]["visitors"] or None, a["ga4_site"]["visitors"] or None))},
    ]

    # ── 03 매체별 비교 표 ─────────────────────────────────
    amap = {c["channel"]: c for c in a["channels"]}
    channel_rows = []
    for c in b["channels"]:
        pa = amap.get(c["channel"], {})
        cpa_b, cpa_a = _cpa(c["ad_cost"], c["conversions"]), _cpa(pa.get("ad_cost", 0), pa.get("conversions", 0))
        channel_rows.append({
            "channel": CH_LABEL.get(c["channel"], c["channel"]),
            "ad_cost": _fmt_won(c["ad_cost"]), "ad_cost_d": _delta_str(_pct(c["ad_cost"], pa.get("ad_cost"))),
            "impressions": _fmt_num(c["impressions"]), "impressions_d": _delta_str(_pct(c["impressions"], pa.get("impressions"))),
            "clicks": _fmt_num(c["clicks"]), "clicks_d": _delta_str(_pct(c["clicks"], pa.get("clicks"))),
            "ctr": _fmt_pct(c["ctr"]), "ctr_d": _delta_str(_pp(c["ctr"], pa.get("ctr")), unit="%p"),
            "cpc": _fmt_won(c["cpc"]), "cpc_d": _delta_str(_pct(c["cpc"], pa.get("cpc")), positive_good=False),
            "conversions": _fmt_num(c["conversions"]), "conversions_d": _delta_str(_pct(c["conversions"], pa.get("conversions"))),
            "cpa": _fmt_won(cpa_b), "cpa_d": _delta_str(_pct(cpa_b, cpa_a), positive_good=False),
        })

    # ── 02 좋아진 / 아쉬운 (규칙) ─────────────────────────
    improved, declined = [], []
    dcost = _pct(sb["ad_cost"], sa["ad_cost"]); dconv = _pct(sb["conversions"], sa["conversions"])
    dcpa = _pct(sb["cpa"], sa["cpa"]); dctr = _pp(sb["ctr"], sa["ctr"]); dcvr = _pp(sb["cvr"], sa["cvr"])
    if dconv is not None and dconv > 0:
        eff = " — 예산 증가율보다 결과 증가율이 높아 효율 개선" if (dcost is not None and dconv > dcost) else ""
        improved.append(f'결과(문의) {_fmt_num(sa["conversions"])} → {_fmt_num(sb["conversions"])}건 (+{dconv}%){eff}')
    if dcpa is not None and dcpa < 0:
        improved.append(f'전환당 비용(CPA) {_fmt_won(sa["cpa"])} → {_fmt_won(sb["cpa"])} ({dcpa}%) — 문의 1건을 더 싸게 확보')
    meta_b = next((c for c in b["channels"] if c["channel"] == "meta"), None)
    meta_a = amap.get("meta")
    if meta_b and meta_a:
        mcpc = _pct(meta_b["cpc"], meta_a["cpc"])
        if mcpc is not None and mcpc < 0:
            improved.append(f"Meta 클릭단가(CPC) {mcpc}% 하락 — 노출·클릭 효율 개선")
    dimp = _pct(sb["impressions"], sa["impressions"])
    if dimp is not None and dimp > 15:
        improved.append(f"도달 규모 확대 — 노출 +{dimp}% · 클릭 +{_pct(sb['clicks'], sa['clicks'])}%")
    if dcvr is not None and dcvr < -0.05:
        declined.append(f'전환율(CVR) {_fmt_pct(sa["cvr"])} → {_fmt_pct(sb["cvr"])} ({dcvr}%p) — 유입 확대 대비 전환이 못 따라옴(희석)')
    if dctr is not None and dctr < -0.05:
        declined.append(f'CTR {_fmt_pct(sa["ctr"])} → {_fmt_pct(sb["ctr"])} ({dctr}%p) — 소재 피로 신호, 신규 소재 로테이션 필요')
    # 네이버 전환 추적 공백(클릭은 있는데 전환 0)
    nv = next((c for c in b["channels"] if c["channel"] in ("naver_powerlink", "naver_place") and c["clicks"] and not c["conversions"]), None)
    if nv:
        declined.append(f'네이버 전환 추적 — {CH_LABEL.get(nv["channel"])} 클릭 {_fmt_num(nv["clicks"])}건인데 전환 0. 실제 0이 아니라 추적 미설정(GA4 핵심이벤트 필요)')
    if not improved:
        improved.append("전월 대비 뚜렷한 개선 지표가 제한적 — 데이터 누적 후 재평가 권장")
    if not declined:
        declined.append("전월 대비 뚜렷한 악화 지표 없음")

    # ── 해석 / 키워드 / 전략 초안 ─────────────────────────
    meta_share = round(meta_b["budget_share"], 1) if meta_b else 0
    interpretation = (
        f"Meta는 예산 비중 {meta_share}%로 계정의 중심이자 전환이 측정되는 채널입니다. "
        "네이버 검색은 클릭은 확보되나 전환 추적이 없어 성과 증명이 어려운 상태이며, "
        "플레이스는 규모가 작고 클릭단가가 높아 확대보다 효율 점검이 우선입니다.")
    kw = b["top_keywords"]
    keyword_note = ""
    if kw:
        top = kw[0]
        keyword_note = (f"‘{top['keyword']}’ 키워드가 파워링크 예산의 큰 비중을 차지합니다"
                        f"(광고비 {_fmt_won(top['ad_cost'])}, 클릭 {_fmt_num(top['clicks'])}, CTR {_fmt_pct(top['ctr'])}). "
                        "전환 추적을 켠 뒤 실제 문의 CPA를 확인해 확대·축소를 판단하세요.")

    strategy_draft = [
        {"title": "네이버 전환 추적부터 켠다 — GA4 ‘핵심 이벤트(웹문의)’ 설정 [최우선]",
         "body": "네이버 검색 클릭의 성과가 ‘0’으로 유실되고 있습니다. GA4에서 문의·상담 완료를 핵심 이벤트로 지정하면 "
                 "네이버의 실제 기여가 잡혀 Meta와 CPA를 나란히 비교해 예산을 재배분할 수 있습니다."},
        {"title": "효율 좋은 채널에 예산을 더 싣는다",
         "body": "CPA·CPC가 개선된 채널(주로 Meta)에 완만히 증액하고, 목표 CPA 상한을 정해 주 단위로 모니터링합니다."},
        {"title": "랜딩·문의 폼 전환 최적화로 CVR을 방어한다",
         "body": "유입이 늘 때 전환율이 희석되지 않도록 웹문의 폼 단축·상담 CTA 상단 배치·모바일 속도를 점검합니다."},
        {"title": "소재 리프레시로 CTR 피로를 회복한다",
         "body": "신규 소재 2~3종을 로테이션하고, 디브릭만의 1:1 맞춤·시공 전후 비주얼을 전면에 세웁니다."},
        {"title": "검색 키워드를 데이터로 재편한다",
         "body": "예산이 편중된 키워드를 점검하고, 전환으로 이어지는 키워드·지역 롱테일로 재분배해 지역을 선점합니다."},
    ]

    return {
        "target": target, "compare": cmp_m,
        "target_label": target.replace("-", "년 ") + "월", "compare_label": cmp_m.replace("-", "년 ") + "월",
        "headline": _headline(dcost, dconv, dcpa),
        "kpi_rows": kpi_rows, "channel_rows": channel_rows,
        "improved": improved, "declined": declined,
        "interpretation": interpretation, "keyword_note": keyword_note,
        "top_keywords": [
            {"keyword": k["keyword"], "campaign": k.get("campaign"), "ad_cost": _fmt_won(k["ad_cost"]),
             "clicks": _fmt_num(k["clicks"]), "ctr": _fmt_pct(k["ctr"]), "cpc": _fmt_won(k["cpc"])}
            for k in kw
        ],
        "strategy_draft": strategy_draft,
        "ga4": {"target": b["ga4_site"], "compare": a["ga4_site"]},
        "raw": {"a": sa, "b": sb},
    }


def _headline(dcost, dconv, dcpa) -> str:
    parts = []
    if dcost is not None:
        parts.append(f"광고비 {'+' if dcost >= 0 else ''}{dcost}%")
    if dconv is not None:
        parts.append(f"결과(문의) {'+' if dconv >= 0 else ''}{dconv}%")
    if dcpa is not None:
        parts.append(f"CPA {dcpa}%{'(개선)' if dcpa < 0 else ''}")
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
