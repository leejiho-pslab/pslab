#!/usr/bin/env python3
"""데이터 정확도 검수(verification) — 무인 운영 데이터의 신뢰성 점검.

agent 환경은 프록시 제한으로 Neon DB·카페24 API 직접 접근이 불가하므로,
이 스크립트는 GitHub Actions(둘 다 접근 가능)에서 실행한다.

두 가지 모드:
  --mode db   (기본) DB만 읽는 점검 — 토큰 사용 X, 백필 동시 실행해도 안전
                · 커버리지: 2025-01-01~어제 중 매출 데이터가 있는/빠진 날짜
                · 지표별 커버리지: 신규 지표(카테고리/베스트/디바이스 등)가 며칠 채워졌나
                · 내부 정합성: 디바이스합·신규재구매합 = 매출, aov = 매출/주문수,
                  카테고리합·베스트합 ≈ 매출(품목 기준이라 근사)
  --mode api  위 + 원천 대조 — 표본 날짜를 카페24 API로 재조회해 DB값과 비교
                · 카페24 토큰을 회전시키므로 백필이 도는 중에는 실행 금지(토큰 경합)

종료코드: 정합성 경고(WARN)가 있어도 0(리포트가 목적). 치명 오류만 1.
"""
from __future__ import annotations

import argparse
from datetime import date as _date
from datetime import timedelta
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.pipeline import yesterday  # noqa: E402
from cafe24_ops.secrets import load_secrets  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

load_secrets()

import logging  # noqa: E402
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

# 디바이스/신규재구매 합은 매출과 '정확히' 일치해야 함(같은 order_amount 기반).
# 주문당 반올림 1원 정도만 허용.
EXACT_TOL_RATIO = 0.001
# 카테고리/베스트 합은 품목 기준이라 배송비·할인으로 매출과 다름 → 비율만 본다.
ITEM_RATIO_LO, ITEM_RATIO_HI = 0.40, 1.60


def _daterange(start: _date, end: _date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def _facts_index(store: Store, dfrom: str, dto: str) -> dict[str, dict]:
    """날짜 → {gross, order_count, aov, device_sum, cust_sum, cat_sum, prod_sum,
    has_category, has_product, has_device, has_customer, has_crm, has_visitors}."""
    idx: dict[str, dict] = {}
    for r in store.get_facts(dfrom, dto, source="cafe24"):
        d = idx.setdefault(r["date"], {})
        m, v, dims = r["metric"], float(r["value"]), r["dims"]
        if m in ("gross_sales", "order_count", "aov", "visitors", "conversion_rate") and not dims:
            d[m] = v
        elif m == "device_sales":
            d["device_sum"] = d.get("device_sum", 0.0) + v
        elif m == "customer_sales":
            d["cust_sum"] = d.get("cust_sum", 0.0) + v
        elif m == "category_sales":
            d["cat_sum"] = d.get("cat_sum", 0.0) + v
            d["has_category"] = True
        elif m == "product_sales":
            d["prod_sum"] = d.get("prod_sum", 0.0) + v
            d["has_product"] = True
        elif m == "crm_count":
            d["has_crm"] = True
    return idx


def _fmt_gaps(dates: list[str], limit: int = 15) -> str:
    if not dates:
        return "없음"
    head = ", ".join(dates[:limit])
    return f"{head}{' …' if len(dates) > limit else ''} (총 {len(dates)}일)"


def check_db(store: Store, start: _date, end: _date) -> int:
    print("=" * 64)
    print(f"■ DB 검수  ({start} ~ {end}, {(end - start).days + 1}일)")
    print("=" * 64)
    idx = _facts_index(store, start.isoformat(), end.isoformat())
    all_dates = [d.isoformat() for d in _daterange(start, end)]

    # 1) 매출 커버리지 -------------------------------------------------
    have_sales = [d for d in all_dates if idx.get(d, {}).get("gross_sales") is not None]
    missing = [d for d in all_dates if d not in have_sales]
    print("\n[1] 매출 커버리지(gross_sales)")
    print(f"  채워짐 : {len(have_sales)}/{len(all_dates)}일")
    print(f"  빠진날 : {_fmt_gaps(missing)}")

    # 2) 신규 지표 커버리지 -------------------------------------------
    def cnt(flag):
        return sum(1 for d in have_sales if idx.get(d, {}).get(flag))
    print("\n[2] 신규 지표 커버리지(매출 있는 날 기준)")
    print(f"  카테고리매출 : {cnt('has_category')}/{len(have_sales)}일")
    print(f"  베스트상품   : {cnt('has_product')}/{len(have_sales)}일")
    print(f"  디바이스매출 : {sum(1 for d in have_sales if 'device_sum' in idx.get(d, {}))}/{len(have_sales)}일")
    print(f"  신규/재구매  : {sum(1 for d in have_sales if 'cust_sum' in idx.get(d, {}))}/{len(have_sales)}일")
    print(f"  후기/CRM     : {cnt('has_crm')}/{len(have_sales)}일")
    print(f"  방문자수     : {sum(1 for d in have_sales if idx.get(d, {}).get('visitors'))}/{len(have_sales)}일 (GA4 미연동 시 0 정상)")
    _etc_share(store, start, end)

    # 3) 내부 정합성 --------------------------------------------------
    print("\n[3] 내부 정합성 (매출 있는 날 전수 검사)")
    warn_device = warn_cust = warn_aov = warn_item = 0
    examples: list[str] = []
    tot_gross = 0.0
    tot_orders = 0.0
    for d in have_sales:
        row = idx[d]
        gross = row.get("gross_sales", 0.0)
        oc = row.get("order_count", 0.0)
        tot_gross += gross
        tot_orders += oc
        tol = max(1.0, gross * EXACT_TOL_RATIO)
        # 디바이스 합 == 매출
        if "device_sum" in row and abs(row["device_sum"] - gross) > tol:
            warn_device += 1
            if len(examples) < 8:
                examples.append(f"    {d} 디바이스합 {row['device_sum']:,.0f} ≠ 매출 {gross:,.0f}")
        # 신규+재구매 == 매출
        if "cust_sum" in row and abs(row["cust_sum"] - gross) > tol:
            warn_cust += 1
            if len(examples) < 8:
                examples.append(f"    {d} 신규+재구매 {row['cust_sum']:,.0f} ≠ 매출 {gross:,.0f}")
        # aov == 매출/주문수
        if oc > 0:
            exp_aov = gross / oc
            if abs(row.get("aov", 0.0) - exp_aov) > max(1.0, exp_aov * 0.01):
                warn_aov += 1
                if len(examples) < 8:
                    examples.append(f"    {d} aov {row.get('aov', 0):,.0f} ≠ 매출/주문 {exp_aov:,.0f}")
        # 카테고리/베스트 합 ≈ 매출(품목 기준 근사) — 비율이 비정상일 때만
        if gross > 0:
            for label, key in (("카테고리", "cat_sum"), ("베스트", "prod_sum")):
                if key in row:
                    ratio = row[key] / gross
                    if not (ITEM_RATIO_LO <= ratio <= ITEM_RATIO_HI):
                        warn_item += 1
                        if len(examples) < 8:
                            examples.append(
                                f"    {d} {label}합/매출 비율 {ratio:.2f} (정상범위 {ITEM_RATIO_LO}~{ITEM_RATIO_HI})")

    def mark(n):
        return "✅ PASS" if n == 0 else f"⚠ WARN({n}일)"
    print(f"  디바이스합 = 매출      : {mark(warn_device)}")
    print(f"  신규+재구매 = 매출     : {mark(warn_cust)}")
    print(f"  aov = 매출/주문수      : {mark(warn_aov)}")
    print(f"  카테고리/베스트합 비율 : {mark(warn_item)}")
    if examples:
        print("  예시:")
        print("\n".join(examples))

    # 4) 합계 요약 ----------------------------------------------------
    print("\n[4] 기간 합계(참고)")
    print(f"  총매출   : {tot_gross:,.0f} 원")
    print(f"  총주문   : {tot_orders:,.0f} 건")
    print(f"  평균객단 : {(tot_gross / tot_orders) if tot_orders else 0:,.0f} 원")

    # 5) 광고 채널 성과(최근 7일) — ROAS/전환매출 건강도 추적 -----------
    _ads_report(store, end)
    return 0


def _etc_share(store: Store, start: _date, end: _date) -> None:
    """카테고리 매출 중 '기타'(미매핑) 비중 + 상위 카테고리 — 매핑 품질 점검."""
    total = etc = 0.0
    by_cat: dict[str, float] = {}
    for r in store.get_facts(start.isoformat(), end.isoformat(), metric="category_sales"):
        v = float(r["value"])
        cat = r["dims"].get("category") or "기타"
        total += v
        by_cat[cat] = by_cat.get(cat, 0.0) + v
        if cat == "기타":
            etc += v
    if total <= 0:
        print("  카테고리 '기타' 비중 : (데이터 없음)")
        return
    share = etc / total * 100
    flag = " ⚠매핑개선 권장(≥25%)" if share >= 25 else ""
    print(f"  카테고리 '기타' 비중 : {share:.1f}%  ({etc:,.0f} / {total:,.0f}원){flag}")
    top = sorted(by_cat.items(), key=lambda kv: -kv[1])[:5]
    print("  상위 카테고리: " + ", ".join(f"{c} {v/total*100:.0f}%" for c, v in top))


def _ads_report(store: Store, end: _date) -> None:
    """최근 7일 광고 채널별 광고비/전환매출/ROAS + 매출대비 광고비율."""
    wfrom = (end - timedelta(days=6)).isoformat()
    wto = end.isoformat()
    by_ch: dict[str, dict] = {}
    for r in store.get_facts(wfrom, wto, source="ads"):
        ch = r["dims"].get("channel") or "?"
        m = by_ch.setdefault(ch, {})
        m[r["metric"]] = m.get(r["metric"], 0.0) + float(r["value"])
    print(f"\n[5] 광고 채널 성과 ({wfrom}~{wto}, 7일)")
    if not by_ch:
        print("  (광고 데이터 없음 — 채널 자격증명/수집 확인)")
        return
    tot_cost = tot_sales = 0.0
    for ch, m in sorted(by_ch.items()):
        cost = m.get("ad_cost", 0.0)
        sales = m.get("ad_sales", 0.0)
        conv = m.get("conversions", 0.0)
        tot_cost += cost
        tot_sales += sales
        roas = f"{sales / cost:.2f}" if cost else "—"
        flag = " ⚠전환매출0(전환추적 확인)" if cost > 0 and sales == 0 else ""
        print(f"  {ch:6} 광고비 {cost:,.0f} · 전환매출 {sales:,.0f} · 전환 {conv:,.0f} · ROAS {roas}{flag}")
    gross7 = sum(r["value"] for r in store.get_daily(wfrom, wto) if r["metric"] == "gross_sales")
    print(f"  합계   광고비 {tot_cost:,.0f} · 전환매출 {tot_sales:,.0f} · "
          f"종합ROAS {(tot_sales / tot_cost):.2f}" if tot_cost else "  합계   광고비 0")
    if gross7 > 0 and tot_cost > 0:
        print(f"         매출대비 광고비(7일) {tot_cost / gross7 * 100:.1f}%")


def check_api(store: Store, config, sample_dates: list[str]) -> int:
    """표본 날짜를 카페24 API로 재조회해 DB값과 대조."""
    from cafe24_ops.clients import Cafe24Client
    from cafe24_ops.collectors.cafe24 import order_amount

    print("\n" + "=" * 64)
    print(f"■ 원천 대조(API)  표본 {len(sample_dates)}일")
    print("=" * 64)
    access = store.get_kv("cafe24_access_token")
    refresh = store.get_kv("cafe24_refresh_token")
    client = Cafe24Client.from_config(config, access_override=access, refresh_override=refresh)
    idx = _facts_index(store, min(sample_dates), max(sample_dates))
    mismatch = 0
    try:
        # 진단 A) 후기 게시판 자동탐지 결과
        try:
            boards = client.list_boards()
            bno = client.review_board_no()
            names = ", ".join(f"{b.get('board_no')}:{b.get('board_name')}" for b in boards[:12])
            print(f"  [진단] 후기 게시판 탐지 → board_no={bno}")
            print(f"         게시판목록: {names or '(목록 조회 실패)'}")
        except Exception as e:  # noqa: BLE001
            print(f"  [진단] 게시판 탐지 오류: {type(e).__name__}: {str(e)[:120]}")

        # 진단 B) 카테고리/베스트 비율 원인 — 최근 표본일 품목 필드 덤프
        for d in reversed(sample_dates):
            try:
                ods = client.list_orders(d, d)
            except Exception:
                continue
            its = [it for o in ods for it in (o.get("items") or [])]
            if not its:
                continue
            it = its[0]
            keys = [k for k in ("payment_amount", "product_price_amount", "actual_payment_amount",
                                "product_price", "option_price", "quantity") if k in it]
            print(f"  [진단] {d} 품목필드 존재: {keys}")
            print(f"         items[0]: " + ", ".join(f"{k}={it.get(k)}" for k in keys))
            break
        for d in sample_dates:
            try:
                orders = client.list_orders(d, d)
                api_gross = sum(order_amount(o) for o in orders)
                api_count = client.count_orders(d, d)
            except Exception as e:  # noqa: BLE001
                print(f"  {d}  API 오류: {type(e).__name__}: {str(e)[:120]}")
                continue
            row = idx.get(d, {})
            db_gross = row.get("gross_sales", 0.0)
            db_count = row.get("order_count", 0.0)
            dg = abs(api_gross - db_gross)
            dc = abs(api_count - db_count)
            ok = dg <= max(1.0, api_gross * EXACT_TOL_RATIO) and dc < 1
            if not ok:
                mismatch += 1
            tag = "✅" if ok else "⚠"
            print(f"  {tag} {d}  매출 DB {db_gross:,.0f} / API {api_gross:,.0f}"
                  f"  · 주문 DB {db_count:.0f} / API {api_count}")
        # 토큰이 회전됐으면 DB에 되돌려 저장(다음 실행 연속성)
        store.set_kv("cafe24_access_token", client.access_token)
        if client.refresh_token:
            store.set_kv("cafe24_refresh_token", client.refresh_token)
    finally:
        client.close()
    print(f"\n  대조 결과: 불일치 {mismatch}/{len(sample_dates)}일")
    return 0


def _pick_samples(start: _date, end: _date, n: int = 8) -> list[str]:
    """최근 5일 + 과거 균등 표본."""
    days = (end - start).days
    out = set()
    for i in range(min(5, days + 1)):
        out.add((end - timedelta(days=i)).isoformat())
    step = max(1, days // max(1, n))
    d = start
    while d <= end and len(out) < n + 5:
        out.add(d.isoformat())
        d += timedelta(days=step)
    return sorted(out)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="데이터 정확도 검수")
    p.add_argument("--mode", choices=["db", "api"], default="db")
    p.add_argument("--start", default="2025-01-01")
    p.add_argument("--end", default=yesterday())
    p.add_argument("--samples", type=int, default=8, help="api 모드 표본 날짜 수")
    args = p.parse_args(argv)

    config = load_config()
    store = Store(config.data_dir)
    start = _date.fromisoformat(args.start)
    end = _date.fromisoformat(args.end)
    try:
        check_db(store, start, end)
        if args.mode == "api":
            check_api(store, config, _pick_samples(start, end, args.samples))
    finally:
        store.close()
    print("\nVERIFY_DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
