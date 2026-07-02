"""핵심 지표 기간 비교 — 저장된 일자별 KPI 로부터 기간 윈도우 값을 집계한다.

윈도우: 최근7일 / 직전7일 / 당월누적 / 전월동기 / 전년동기
- 합산형 지표(매출·주문수·방문자·광고비·광고매출)는 윈도우 합
- 파생 지표(객단가·전환율·광고비율)는 합산 기반으로 재계산
"""
from __future__ import annotations

from datetime import date as _date
from datetime import timedelta

SUM_METRICS = {"gross_sales", "order_count", "visitors", "new_signups", "ad_cost", "ad_sales"}


def _window_ranges(base: _date) -> dict[str, tuple[_date, _date]]:
    recent_start = base - timedelta(days=6)
    prev_end = recent_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=6)
    mtd_start = base.replace(day=1)

    # 전월 동기: 한 달 전 같은 일자까지 그 달 1일부터
    if base.month == 1:
        pm_year, pm_month = base.year - 1, 12
    else:
        pm_year, pm_month = base.year, base.month - 1
    pm_day = min(base.day, _days_in_month(pm_year, pm_month))
    pm_end = _date(pm_year, pm_month, pm_day)
    pm_start = _date(pm_year, pm_month, 1)

    # 전년 동기
    py_day = min(base.day, _days_in_month(base.year - 1, base.month))
    py_end = _date(base.year - 1, base.month, py_day)
    py_start = _date(base.year - 1, base.month, 1)

    return {
        "recent_7d": (recent_start, base),
        "prev_7d": (prev_start, prev_end),
        "month_to_date": (mtd_start, base),
        "prev_month_same": (pm_start, pm_end),
        "prev_year_same": (py_start, py_end),
    }


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        nxt = _date(year + 1, 1, 1)
    else:
        nxt = _date(year, month + 1, 1)
    return (nxt - _date(year, month, 1)).days


def _agg(metric: str, sums: dict[str, float]) -> float | None:
    if metric in SUM_METRICS:
        return sums.get(metric)
    if metric == "aov":
        g, o = sums.get("gross_sales"), sums.get("order_count")
        return (g / o) if g is not None and o else None
    if metric == "conversion_rate":
        o, v = sums.get("order_count"), sums.get("visitors")
        return (o / v * 100) if o is not None and v else None
    if metric == "signup_rate":
        s, v = sums.get("new_signups"), sums.get("visitors")
        return (s / v * 100) if s is not None and v else None
    if metric == "ad_cost_ratio":
        c, g = sums.get("ad_cost"), sums.get("gross_sales")
        return (c / g * 100) if c is not None and g else None
    return None


def summary_cards_range(store, date_from: str, date_to: str, metrics) -> list[dict]:
    """선택 기간[from,to] 합계로 요약 카드 값을 만든다(단일일이면 그날 값).

    합산형은 기간 합, 파생형(객단가/전환율/광고비율)은 합산 기반 재계산 →
    상단 요약 카드와 '핵심 지표 기간 비교' 표의 같은 기간 값이 일치한다.
    """
    rows = store.get_daily(date_from, date_to)
    sums: dict[str, float] = {}
    for r in rows:
        sums[r["metric"]] = sums.get(r["metric"], 0.0) + float(r["value"])
    return [
        {"key": c["key"], "label": c["label"], "format": c.get("format"),
         "value": _agg(c["key"], sums)}
        for c in metrics.summary_cards
    ]


def period_comparison(store, base_date: str, metrics) -> list[dict]:
    """metrics.period_comparison_rows 각 지표에 대해 윈도우별 값 + 최근7일 증감률을 만든다."""
    base = _date.fromisoformat(base_date)
    windows = _window_ranges(base)

    # 윈도우별로 일자 KPI 합산
    win_sums: dict[str, dict[str, float]] = {}
    for wname, (start, end) in windows.items():
        rows = store.get_daily(start.isoformat(), end.isoformat())
        acc: dict[str, float] = {}
        for r in rows:
            acc[r["metric"]] = acc.get(r["metric"], 0.0) + float(r["value"])
        win_sums[wname] = acc

    out = []
    for row in metrics.period_comparison_rows:
        key, label = row["key"], row.get("label", row["key"])
        values = {w: _agg(key, win_sums[w]) for w in windows}
        recent, prev = values.get("recent_7d"), values.get("prev_7d")
        delta = None
        if recent is not None and prev not in (None, 0):
            delta = round((recent - prev) / prev * 100, 1)
        out.append({"key": key, "label": label, "values": values, "delta_recent_vs_prev": delta})
    return out
