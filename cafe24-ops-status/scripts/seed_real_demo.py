#!/usr/bin/env python3
"""실데이터 데모 시드 — 토큰 없이 대시보드에서 '진짜' 경쟁사 데이터 확인.

config/seed/competitors_real.json (네이버 공개 API 실응답 표본)을 실제 매핑
함수로 facts 변환해 스토어에 적재한다. 운영지표(매출/광고)는 mock 으로 채워
대시보드 전체가 보이게 한다.

    python scripts/seed_real_demo.py            # mock(운영) + 실데이터(경쟁사) 적재
    python scripts/seed_real_demo.py --days 30  # 운영지표 백필 일수

주의: 경쟁사 데이터는 특정 시점의 실측 '스냅샷'이다(라이브 자동수집은
NAVER_CLIENT_ID 설정 후 run_all --mode live 가 담당).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cafe24_ops.clients.naver_datalab import naver_trend_to_facts  # noqa: E402
from cafe24_ops.clients.naver_search import (  # noqa: E402
    blog_to_reviews,
    shop_to_bestsellers,
    shop_to_promotions,
)
from cafe24_ops.config import load_config  # noqa: E402
from cafe24_ops.models import Fact  # noqa: E402
from cafe24_ops.pipeline import run_pipeline  # noqa: E402
from cafe24_ops.store import Store  # noqa: E402

FIXTURE = Path(__file__).resolve().parent.parent / "config" / "seed" / "competitors_real.json"


def competitor_facts(fx: dict) -> list[dict]:
    date = fx["base_date"]
    records = naver_trend_to_facts(fx.get("datalab", {}))
    for name, raw in (fx.get("shop") or {}).items():
        records += shop_to_bestsellers(date, name, raw, top=3)
        records += shop_to_promotions(date, name, raw)
    for name, raw in (fx.get("blog") or {}).items():
        records += blog_to_reviews(date, name, raw)
    return records


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="실데이터 데모 시드")
    p.add_argument("--days", type=int, default=30, help="운영지표(mock) 백필 일수")
    args = p.parse_args(argv)

    if not FIXTURE.exists():
        print(f"  ✗ fixture 없음: {FIXTURE}")
        return 2
    fx = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cfg = load_config()
    store = Store(cfg.data_dir)

    # ① 운영지표(매출/광고/소재) — mock 으로 대시보드 채우기
    from datetime import date as _date
    from datetime import timedelta

    base = fx["base_date"]
    base_d = _date.fromisoformat(base)
    for i in range(args.days - 1, -1, -1):
        run_pipeline((base_d - timedelta(days=i)).isoformat(), cfg, store, mode="mock")

    # ② 경쟁사 — mock 을 실데이터로 교체.
    #    트렌드(naver_search_volume)는 fixture 가 전체 기간을 커버 → 범위 전체 교체.
    #    스냅샷 지표(베스트/후기/프로모션)는 단일 시점 → base_date 만 교체.
    store.db.execute(
        "DELETE FROM facts WHERE source='competitor' AND metric='naver_search_volume' "
        "AND date BETWEEN ? AND ?",
        (fx.get("trend_from", base), fx.get("trend_to", base)),
    )
    store.db.execute(
        "DELETE FROM facts WHERE source='competitor' AND date=? AND metric IN "
        "('bestseller','new_reviews','active_promotions')",
        (base,),
    )
    store.db.commit()
    recs = competitor_facts(fx)
    store.save_raw(base, "competitors_real_seed", recs)
    n = store.upsert_facts([Fact.from_raw(r) for r in recs])

    print(f"✓ 시드 완료: 운영 {args.days}일(mock) + 경쟁사 실데이터 {n} facts")
    print(f"  저장: {store.db_path}")
    print("  대시보드: ./scripts/dev.sh  → 경쟁사 탭에서 실제 네이버 상품/트렌드 확인")
    store.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
