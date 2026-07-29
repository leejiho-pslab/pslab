"""GA4 사이트 분석 집계 — facts(ga4_site/ga4_channel/ga4_page) → 요약·추이·매체별·페이지별.

방문자/세션/페이지뷰는 기간 합계, 평균 체류시간은 세션수 가중평균으로 낸다
(단순 평균은 트래픽 적은 날이 과대 반영됨).
"""
from __future__ import annotations

from datetime import date as _date, timedelta

# facts metric 키(site_ 접두어) → API/프론트 노출 키
FACT_TO_API = {
    "site_visitors": "visitors",
    "site_sessions": "sessions",
    "site_page_views": "page_views",
    "site_avg_duration": "avg_session_duration",
    "site_new": "new_users",
    "site_returning": "returning_users",
}

# GA4 sessionSourceMedium → 대시보드 채널 키 / 사람이 읽는 라벨.
# keek GA4 실제 값 기준(2026-07 트래픽 획득 보고서에서 확인).
# 여기 없는 값은 "기타"로 묶이되 source_medium 원문이 표에 그대로 남아 추적 가능하다.
SOURCE_MEDIUM_CHANNEL = {
    # 광고(유료)
    "criteo / display": ("criteo", "크리테오"),
    "sns / meta": ("meta", "Meta(페북·인스타)"),
    "ig / paid": ("meta", "Meta(페북·인스타)"),
    "naver / gfa": ("naver_gfa", "네이버 GFA"),
    "KK_powerlink_MO / powerlink": ("naver_powerlink", "네이버 파워링크"),
    "KK_powerlink_PC / powerlink": ("naver_powerlink", "네이버 파워링크"),
    "KK_BS_MO / bs": ("naver_brandsearch", "네이버 브랜드검색"),
    "KK_BS_PC / bs": ("naver_brandsearch", "네이버 브랜드검색"),
    "google / cpc": ("google", "Google 광고"),
    "kakao / cpc": ("kakao", "카카오"),
    # 비광고(자연 유입)
    "(direct) / (none)": ("direct", "직접 유입"),
    "google / organic": ("organic_search", "자연 검색"),
    "naver / organic": ("organic_search", "자연 검색"),
    "ig / social": ("organic_social", "SNS 자연유입"),
    "instagram / social": ("organic_social", "SNS 자연유입"),
}

# 광고 채널(유료) — 비광고 유입과 구분해 집계·표시한다.
AD_CHANNELS = {"criteo", "meta", "naver_gfa", "naver_powerlink",
               "naver_brandsearch", "google", "kakao"}

UNMAPPED = ("etc", "기타")


def classify_source_medium(source_medium: str) -> tuple[str, str]:
    """source/medium → (채널키, 라벨). 매핑에 없으면 ("etc", "기타")."""
    return SOURCE_MEDIUM_CHANNEL.get(source_medium, UNMAPPED)


def prev_period(date_from: str, date_to: str) -> tuple[str, str]:
    """직전 동일 길이 기간 — 7일 조회면 그 앞 7일. 변화(%p, %) 비교의 기본 기준."""
    a, b = _date.fromisoformat(date_from), _date.fromisoformat(date_to)
    span = (b - a).days + 1
    return (a - timedelta(days=span)).isoformat(), (a - timedelta(days=1)).isoformat()


def _by_date(store, date_from: str, date_to: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="ga4_site"):
        key = FACT_TO_API.get(r["metric"])
        if key:
            out.setdefault(r["date"], {})[key] = float(r["value"])
    return out


def site_trend(store, date_from: str, date_to: str) -> list[dict]:
    """일자별 추이 — [{date, visitors, sessions, page_views, avg_session_duration, ...}]."""
    by_date = _by_date(store, date_from, date_to)
    return [
        {"date": d, **{k: by_date[d].get(k) for k in FACT_TO_API.values()}}
        for d in sorted(by_date)
    ]


def site_summary(store, date_from: str, date_to: str) -> dict:
    """기간 요약 — 합계 + 세션 가중평균 체류시간. 데이터 없으면 값들이 None/0."""
    by_date = _by_date(store, date_from, date_to)
    visitors = sum(m.get("visitors", 0.0) for m in by_date.values())
    sessions = sum(m.get("sessions", 0.0) for m in by_date.values())
    page_views = sum(m.get("page_views", 0.0) for m in by_date.values())
    new_users = sum(m.get("new_users", 0.0) for m in by_date.values())
    returning_users = sum(m.get("returning_users", 0.0) for m in by_date.values())
    weighted = sum(m.get("avg_session_duration", 0.0) * m.get("sessions", 0.0)
                   for m in by_date.values())
    return {
        "visitors": visitors,
        "sessions": sessions,
        "page_views": page_views,
        "new_users": new_users,
        "returning_users": returning_users,
        "avg_session_duration": round(weighted / sessions, 1) if sessions else None,
        "pages_per_session": round(page_views / sessions, 2) if sessions else None,
        "days": len(by_date),
    }


def _sum_by_dim(store, date_from, date_to, source, dim_key) -> dict[str, dict]:
    """source 별 facts 를 dims[dim_key] 로 묶어 metric 합계를 낸다 → {dim_value: {metric: sum}}."""
    agg: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source=source):
        dv = (r.get("dims") or {}).get(dim_key)
        if not dv:
            continue
        m = agg.setdefault(dv, {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    return agg


def _derive_rate(m: dict) -> dict:
    sessions, conv = m.get("sessions", 0.0), m.get("conversions", 0.0)
    return {
        "sessions": sessions,
        "users": m.get("users", 0.0),
        "conversions": conv,
        "cvr": round(conv / sessions * 100, 2) if sessions else None,
    }


def source_medium_breakdown(store, sel_from, sel_to, cmp_from=None, cmp_to=None) -> list[dict]:
    """GA4 매체별(sessionSourceMedium) 세션/사용자/전환 — 세션 내림차순, 비교기간 대비 증감."""
    sel = _sum_by_dim(store, sel_from, sel_to, "ga4_channel", "source_medium")
    cmp = (_sum_by_dim(store, cmp_from, cmp_to, "ga4_channel", "source_medium")
           if cmp_from and cmp_to else {})
    rows = []
    for sm, m in sel.items():
        channel, label = classify_source_medium(sm)
        prev = (cmp.get(sm) or {}).get("sessions")
        sessions = m.get("sessions", 0.0)
        rows.append({
            "source_medium": sm,
            "channel": channel,
            "label": label,
            "is_ad": channel in AD_CHANNELS,
            **_derive_rate(m),
            # 채널 단위로 다시 합산할 수 있게 비교기간 원값도 함께 둔다
            "prev_sessions": prev,
            "sessions_delta": round((sessions - prev) / prev * 100, 1) if prev else None,
        })
    return sorted(rows, key=lambda x: -x["sessions"])


def channel_breakdown(store, sel_from, sel_to, cmp_from=None, cmp_to=None) -> list[dict]:
    """매체를 채널 단위로 합쳐 보여준다(예: sns/meta + ig/paid → Meta 하나로)."""
    agg: dict[str, dict] = {}
    for row in source_medium_breakdown(store, sel_from, sel_to, cmp_from, cmp_to):
        e = agg.setdefault(row["channel"], {
            "channel": row["channel"], "label": row["label"], "is_ad": row["is_ad"],
            "sessions": 0.0, "users": 0.0, "conversions": 0.0, "prev_sessions": 0.0,
            "source_mediums": [],
        })
        e["sessions"] += row["sessions"]
        e["users"] += row["users"]
        e["conversions"] += row["conversions"]
        e["prev_sessions"] += row["prev_sessions"] or 0.0
        e["source_mediums"].append(row["source_medium"])
    out = []
    for e in agg.values():
        sessions, conv, prev = e["sessions"], e["conversions"], e["prev_sessions"]
        out.append({
            **e,
            "cvr": round(conv / sessions * 100, 2) if sessions else None,
            "sessions_delta": round((sessions - prev) / prev * 100, 1) if prev else None,
        })
    return sorted(out, key=lambda x: -x["sessions"])


def top_pages(store, date_from: str, date_to: str, limit: int = 10) -> list[dict]:
    """GA4 페이지별(pageTitle) 조회수 상위 N — 조회수 내림차순."""
    agg = _sum_by_dim(store, date_from, date_to, "ga4_page", "page")
    rows = [{"page": p, "views": m.get("views", 0.0)} for p, m in agg.items()]
    return sorted(rows, key=lambda x: -x["views"])[:limit]


# ── 이탈 페이지 (랜딩페이지 이탈률 + 기간 대비 변화) ───────────────
def _landing_rates(store, date_from, date_to) -> dict[str, dict]:
    """랜딩페이지별 세션 가중 이탈률/참여율. 이탈률은 세션수로 가중평균해야
    (단순 평균은 세션 적은 날이 과대 반영) 기간 값이 실제와 맞는다."""
    acc: dict[str, dict] = {}
    for r in store.get_facts(date_from, date_to, source="ga4_landing"):
        page = (r.get("dims") or {}).get("page")
        if not page:
            continue
        acc.setdefault(page, {}).setdefault(r["date"], {})[r["metric"]] = float(r["value"])
    out: dict[str, dict] = {}
    for page, by_date in acc.items():
        sessions = sum(m.get("sessions", 0.0) for m in by_date.values())
        wb = sum(m.get("bounce_rate", 0.0) * m.get("sessions", 0.0) for m in by_date.values())
        we = sum(m.get("engagement_rate", 0.0) * m.get("sessions", 0.0) for m in by_date.values())
        out[page] = {
            "sessions": sessions,
            "bounce_rate": round(wb / sessions, 2) if sessions else None,
            "engagement_rate": round(we / sessions, 2) if sessions else None,
        }
    return out


def exit_pages(store, sel_from, sel_to, cmp_from=None, cmp_to=None,
               limit: int = 15, min_sessions: float = 30) -> list[dict]:
    """이탈이 심한 랜딩페이지 + 비교기간 대비 이탈률 변화(%p).

    GA4 Data API 에는 UA 의 종료수(exits) 지표가 없어(400) 이탈률(bounceRate)로 본다.
    세션이 너무 적은 페이지는 이탈률이 요동쳐 오해를 부르므로 min_sessions 미만은 제외.
    """
    sel = _landing_rates(store, sel_from, sel_to)
    cmp = _landing_rates(store, cmp_from, cmp_to) if cmp_from and cmp_to else {}
    rows = []
    for page, m in sel.items():
        if m["sessions"] < min_sessions:
            continue
        prev = (cmp.get(page) or {}).get("bounce_rate")
        cur = m["bounce_rate"]
        rows.append({
            "page": page,
            "sessions": m["sessions"],
            "bounce_rate": cur,
            "engagement_rate": m["engagement_rate"],
            "prev_bounce_rate": prev,
            # %p 변화 — 양수면 이탈이 늘어난 것(나빠짐)
            "bounce_delta": round(cur - prev, 2) if (cur is not None and prev is not None) else None,
        })
    # 이탈이 늘어난 순 → 그다음 이탈률 높은 순 (악화 신호를 위로)
    return sorted(rows, key=lambda x: (-(x["bounce_delta"] or -999), -(x["bounce_rate"] or 0)))[:limit]


# ── 유입 경로 (광고 → 랜딩페이지) ──────────────────────────────
def entry_paths(store, date_from: str, date_to: str, limit_per_channel: int = 5) -> list[dict]:
    """채널별로 "어느 페이지로 착지했는지" 상위 N — 광고→페이지 유입 경로."""
    agg: dict[tuple, float] = {}
    for r in store.get_facts(date_from, date_to, source="ga4_entry"):
        d = r.get("dims") or {}
        page, sm = d.get("page"), d.get("source_medium")
        if not page or not sm:
            continue
        agg[(sm, page)] = agg.get((sm, page), 0.0) + float(r["value"])

    by_channel: dict[str, dict] = {}
    for (sm, page), sessions in agg.items():
        channel, label = classify_source_medium(sm)
        e = by_channel.setdefault(channel, {
            "channel": channel, "label": label, "is_ad": channel in AD_CHANNELS,
            "sessions": 0.0, "_pages": {},
        })
        e["sessions"] += sessions
        e["_pages"][page] = e["_pages"].get(page, 0.0) + sessions

    out = []
    for e in by_channel.values():
        pages = sorted(e.pop("_pages").items(), key=lambda x: -x[1])[:limit_per_channel]
        total = e["sessions"] or 1.0
        out.append({**e, "pages": [
            {"page": p, "sessions": s, "share": round(s / total * 100, 1)} for p, s in pages
        ]})
    return sorted(out, key=lambda x: -x["sessions"])


# ── 구매 퍼널 (채널별 단계 이탈) ───────────────────────────────
def purchase_funnel(store, date_from: str, date_to: str, channel: str | None = None) -> dict:
    """구매 경로 퍼널 — 단계별 건수 + 직전 단계 대비 통과율.

    channel 을 주면 그 채널 유입만(예: meta), 없으면 전체.
    GA4 Data API 는 실제 이동 순서(A→B→C)를 주지 않으므로 이벤트 건수의 단계별
    감소로 "어디서 많이 빠지는지"를 본다 — 개별 사용자 경로 추적이 아님에 유의.
    """
    from ..clients.ga4 import FUNNEL_STEPS

    counts: dict[str, float] = {}
    for r in store.get_facts(date_from, date_to, source="ga4_funnel"):
        d = r.get("dims") or {}
        ev, sm = d.get("event"), d.get("source_medium")
        if not ev or not sm:
            continue
        if channel and classify_source_medium(sm)[0] != channel:
            continue
        counts[ev] = counts.get(ev, 0.0) + float(r["value"])

    steps, prev = [], None
    first = counts.get(FUNNEL_STEPS[0][0], 0.0)
    for event, label in FUNNEL_STEPS:
        c = counts.get(event, 0.0)
        steps.append({
            "event": event, "label": label, "count": c,
            # 직전 단계 대비 통과율 — 낮은 단계가 병목
            "step_rate": round(c / prev * 100, 1) if prev else None,
            # 첫 단계 대비 — 전체 퍼널에서의 위치
            "overall_rate": round(c / first * 100, 2) if first else None,
            "drop": round(prev - c) if prev is not None else None,
        })
        prev = c

    # 병목 = 통과율이 가장 낮은 단계(첫 단계 제외)
    candidates = [s for s in steps[1:] if s["step_rate"] is not None]
    bottleneck = min(candidates, key=lambda s: s["step_rate"]) if candidates else None
    return {"channel": channel, "steps": steps,
            "bottleneck": bottleneck["label"] if bottleneck else None}


def funnel_by_channel(store, date_from: str, date_to: str) -> list[dict]:
    """채널별 퍼널 요약 — 시작(페이지조회) → 결제완료 전환율 비교."""
    from ..clients.ga4 import FUNNEL_STEPS

    channels: set[str] = set()
    for r in store.get_facts(date_from, date_to, source="ga4_funnel"):
        sm = (r.get("dims") or {}).get("source_medium")
        if sm:
            channels.add(classify_source_medium(sm)[0])

    first_ev, last_ev = FUNNEL_STEPS[0][0], FUNNEL_STEPS[-1][0]
    out = []
    for ch in channels:
        f = purchase_funnel(store, date_from, date_to, channel=ch)
        by_ev = {s["event"]: s["count"] for s in f["steps"]}
        start, end = by_ev.get(first_ev, 0.0), by_ev.get(last_ev, 0.0)
        label = next((lbl for sm, (c, lbl) in SOURCE_MEDIUM_CHANNEL.items() if c == ch),
                     UNMAPPED[1])
        out.append({
            "channel": ch, "label": label, "is_ad": ch in AD_CHANNELS,
            "start": start, "purchases": end,
            "cvr": round(end / start * 100, 3) if start else None,
            "bottleneck": f["bottleneck"],
        })
    return sorted(out, key=lambda x: -x["start"])
