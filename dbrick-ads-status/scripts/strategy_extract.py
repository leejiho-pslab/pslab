#!/usr/bin/env python3
"""8~9월 전략 수립용 실데이터 일괄 추출 (GitHub Actions 전용).

한 번의 실행으로 로그에 섹션별 JSON 을 찍는다:
  1) DB(facts): 월별 채널 성과 / 네이버 키워드 리포트 / Meta 소재 성과(썸네일 포함)
     / GA4 사이트·매체·페이지 / 7월 일별 추이
  2) 지역현황 구글시트(우선순위 지역 파악)
  3) 네이버 검색광고 키워드도구(RelKwdStat) — 시즌·업종 월간 검색량/경쟁정도

출력 형식: ===SECTION:<name>=== 한 줄 뒤 JSON 한 줄 → 로그에서 grep 으로 회수.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402
from cafe24_ops.etl.ads_metrics import ads_channels_range, ads_summary_range, ads_channel_trend  # noqa: E402
from cafe24_ops.etl.keyword_metrics import keyword_report, keyword_summary  # noqa: E402
from cafe24_ops.etl.creative_metrics import creative_overview  # noqa: E402
from cafe24_ops.etl.ga4_site import site_summary, source_medium_breakdown, top_pages  # noqa: E402

load_secrets()

MONTHS = [("2026-05", "2026-05-01", "2026-05-31"),
          ("2026-06", "2026-06-01", "2026-06-30"),
          ("2026-07", "2026-07-01", "2026-07-31")]


def emit(name: str, obj) -> None:
    # GitHub Actions 시크릿 마스킹이 멀티라인 시크릿의 개별 라인({,} 등)을 ***로
    # 가려 JSON 이 깨진다 → base64 로 찍어 마스킹을 원천 회피.
    import base64
    b64 = base64.b64encode(
        json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
    ).decode()
    print(f"===SECTION:{name}===")
    for i in range(0, len(b64), 800):
        print(f"B64|{b64[i:i+800]}")
    print(f"===END:{name}===")


def db_sections(store: Store) -> None:
    # 1) 월별 채널 성과
    monthly = {}
    for ym, f, t in MONTHS:
        monthly[ym] = {
            "summary": ads_summary_range(store, f, t),
            "channels": ads_channels_range(store, f, t),
        }
    emit("monthly_channels", monthly)

    # 2) 키워드 리포트 (6~7월 합산) — 파워링크 상위 45 + 플레이스 상위 12
    emit("kw_powerlink", {
        "summary": keyword_summary(store, "2026-06-01", "2026-07-31", "naver_powerlink"),
        "rows": keyword_report(store, "2026-06-01", "2026-07-31", "naver_powerlink", "ad_cost", 45),
    })
    emit("kw_place", {
        "summary": keyword_summary(store, "2026-06-01", "2026-07-31", "naver_place"),
        "rows": keyword_report(store, "2026-06-01", "2026-07-31", "naver_place", "ad_cost", 12),
    })

    # 3) Meta 소재 성과 (6~7월, 전환순) — 썸네일 URL 포함 상위 18
    ov = creative_overview(store, "2026-06-01", "2026-07-31", "conversions")
    metas = [c for c in (ov.get("creatives") or []) if c.get("channel") == "meta"][:18]
    emit("creatives", {"summary": ov.get("summary"), "rows": metas})

    # 4) GA4 — 7월 사이트 요약 / 매체별 / 인기 페이지
    emit("ga4", {
        "site_jul": site_summary(store, "2026-07-01", "2026-07-31"),
        "site_jun": site_summary(store, "2026-06-01", "2026-06-30"),
        "channels_jul": source_medium_breakdown(store, "2026-07-01", "2026-07-31"),
        "pages_jul": top_pages(store, "2026-07-01", "2026-07-31", 12),
    })

    # 5) 7월 일별 채널 추이 (compact: 날짜/광고비/전환)
    tr = ads_channel_trend(store, "2026-07-01", "2026-07-31")
    compact = {ch: [[r["date"][-2:], round(r["ad_cost"]), r.get("conversions") or 0]
                    for r in rows] for ch, rows in (tr.get("trend") or {}).items()}
    emit("trend_jul", compact)


def region_section(cfg) -> None:
    try:
        from cafe24_ops.clients.region_sheet import fetch_region_status
        rs = cfg.sources.region_status or {}
        data = fetch_region_status(rs.get("sheet_id", ""), rs.get("gid", "0"))
        emit("region_status", {"headers": data.get("headers"), "rows": data.get("rows")})
    except Exception as e:  # noqa: BLE001
        emit("region_status", {"error": f"{type(e).__name__}: {e}"})


# ── 네이버 키워드도구(RelKwdStat) ────────────────────────────────
SEED_BATCHES = [
    # 업종 코어
    ["인테리어", "아파트인테리어", "리모델링", "아파트리모델링", "인테리어업체"],
    # 공간별
    ["주방인테리어", "욕실인테리어", "화장실리모델링", "거실인테리어", "베란다확장"],
    # 부분/올수리·평형
    ["부분인테리어", "올리모델링", "구축아파트리모델링", "30평대인테리어", "20평대인테리어"],
    # 시즌·수요 트리거
    ["이사인테리어", "입주인테리어", "신혼집인테리어", "도배장판", "샷시교체"],
    # 견적·비용(하퍼널)
    ["인테리어견적", "인테리어비용", "리모델링비용", "아파트올수리비용", "인테리어잘하는곳"],
]


def keywordstool_section() -> None:
    from cafe24_ops.clients.ads_naver import NAVER_SA_BASE, sign
    import httpx

    api_key = os.environ.get("NAVER_SA_API_KEY", "")
    secret = os.environ.get("NAVER_SA_SECRET_KEY", "")
    customer = os.environ.get("NAVER_SA_CUSTOMER_ID", "")
    if not (api_key and secret and customer):
        emit("keywordstool", {"error": "NAVER_SA credentials missing"})
        return

    path = "/keywordstool"
    out = {}
    with httpx.Client(base_url=NAVER_SA_BASE, timeout=30.0) as http:
        for batch in SEED_BATCHES:
            ts = str(int(time.time() * 1000))
            headers = {"X-Timestamp": ts, "X-API-KEY": api_key,
                       "X-Customer": customer,
                       "X-Signature": sign(secret, ts, "GET", path)}
            try:
                r = http.get(path, params={"hintKeywords": ",".join(batch), "showDetail": 1},
                             headers=headers)
                r.raise_for_status()
                rows = (r.json() or {}).get("keywordList") or []
            except Exception as e:  # noqa: BLE001
                out[batch[0]] = {"error": f"{type(e).__name__}: {e}"}
                continue

            def vol(x):
                # "< 10" 같은 문자열 처리
                try:
                    return int(x)
                except (TypeError, ValueError):
                    return 0

            seeds = {b.replace(" ", "") for b in batch}
            picked = []
            for k in rows:
                kw = (k.get("relKeyword") or "").replace(" ", "")
                pc, mo = vol(k.get("monthlyPcQcCnt")), vol(k.get("monthlyMobileQcCnt"))
                rec = {"kw": kw, "pc": pc, "mo": mo, "tot": pc + mo,
                       "comp": k.get("compIdx"),
                       "clk": round(float(k.get("monthlyAveMobileClkCnt") or 0)
                                    + float(k.get("monthlyAvePcClkCnt") or 0), 1)}
                if kw in seeds:
                    picked.append({**rec, "seed": True})
                else:
                    picked.append(rec)
            # 시드 + 관련키워드 검색량 상위 25 만 보존
            seeds_rows = [p for p in picked if p.get("seed")]
            rel_rows = sorted([p for p in picked if not p.get("seed")],
                              key=lambda x: -x["tot"])[:25]
            out[batch[0]] = {"seeds": seeds_rows, "related_top": rel_rows}
            time.sleep(0.4)
    emit("keywordstool", out)


def main() -> int:
    # STRATEGY_SEEDS="a,b,c;d,e" 지정 시 키워드도구만 해당 배치로 조회(빠른 재조회용)
    seeds_env = os.environ.get("STRATEGY_SEEDS", "").strip()
    if seeds_env:
        global SEED_BATCHES
        SEED_BATCHES = [[k.strip() for k in b.split(",") if k.strip()]
                        for b in seeds_env.split(";") if b.strip()]
        keywordstool_section()
        print("===STRATEGY_EXTRACT_DONE===")
        return 0

    cfg = load_config()
    store = Store(cfg.data_dir)
    try:
        db_sections(store)
    finally:
        store.close()
    region_section(cfg)
    keywordstool_section()
    print("===STRATEGY_EXTRACT_DONE===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
