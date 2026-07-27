"""keek 상품 상세 + 인스타그램 계정 원본 데이터 수집기 (GitHub Actions 전용).

에이전트 샌드박스는 keek-line.com / instagram.com / api.cafe24.com egress 가 막혀 있다.
GitHub 러너는 열려 있으므로 여기서 원본을 끌어와 로그와 아티팩트로 남긴다.
(`keek-api-smoke.yml` 이 onrender 를 확인하는 것과 같은 패턴)

3개 소스를 각각 독립적으로 시도한다 — 하나가 실패해도 나머지는 수집된다.

  1) storefront : keek-line.com 상품 페이지 HTML 파싱 (자격증명 불필요)
  2) cafe24     : Cafe24 Admin API 상품/옵션/변형 (CAFE24_* + DATABASE_URL 토큰)
  3) instagram  : Instagram Graph API business_discovery
                  (PSLAB_INSTAGRAM_ACCESS_TOKEN / PSLAB_INSTAGRAM_IG_USER_ID)

사용:
    python scripts/keek_product_ig_pull.py --out out
    python scripts/keek_product_ig_pull.py --only instagram --ig-users keek_kr,keek_crew
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import httpx

# --- 분석 대상 -------------------------------------------------------------

PRODUCTS = [
    {
        "product_no": 1833,
        "slug": "keek-pillowdy-uv-light-windbreaker-v3",
        "url": "https://keek-line.com/product/keek-pillowdy-uv-light-windbreaker-v3/1833/category/24/display/3/",
    },
    {
        "product_no": 1793,
        "slug": "keek-pillowdy-utility-nylon-vest-mesh-lining",
        "url": "https://keek-line.com/product/keek-pillowdy-utility-nylon-vest-mesh-lining/1793/category/24/display/1/",
    },
]

DEFAULT_IG_USERS = ["keek_kr", "keek_jp"]

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

GRAPH_VERSION = os.environ.get("META_GRAPH_VERSION", "v21.0")


# --- 1) 스토어프론트 -------------------------------------------------------

def _text(node) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)) if node else ""


def scrape_storefront(product: dict) -> dict:
    """상품 페이지 HTML 에서 이름·가격·옵션·상세설명·사이즈표·이미지를 뽑는다."""
    from bs4 import BeautifulSoup

    out: dict = {"product_no": product["product_no"], "url": product["url"]}
    with httpx.Client(timeout=60, follow_redirects=True,
                      headers={"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9"}) as c:
        r = c.get(product["url"])
        out["http_status"] = r.status_code
        r.raise_for_status()
        html = r.text

    out["html_bytes"] = len(html)
    soup = BeautifulSoup(html, "html.parser")

    # 메타 / 구조화 데이터
    def meta(prop: str) -> str:
        tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
        return (tag.get("content") or "").strip() if tag else ""

    out["title"] = _text(soup.title)
    out["og_title"] = meta("og:title")
    out["og_description"] = meta("og:description")
    out["og_image"] = meta("og:image")

    ld = []
    for tag in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            ld.append(json.loads(tag.string or "{}"))
        except (ValueError, TypeError):
            pass
    out["ld_json"] = ld

    # 카페24 기본 레이아웃의 상품 상세 테이블 (상품명/판매가/적립금/배송 등)
    detail: dict[str, str] = {}
    for tbl in soup.select("table, .xans-product-detaildesign, #span_product_price_text"):
        for row in tbl.select("tr"):
            k = _text(row.find("th"))
            v = _text(row.find("td"))
            if k and v and len(k) < 40:
                detail.setdefault(k, v)
    out["detail_table"] = detail

    # 가격 (카페24 표준 엘리먼트)
    for sel, key in (("#span_product_price_text", "price_sale"),
                     ("#span_product_price_custom", "price_custom"),
                     ("#span_product_price_org", "price_org")):
        el = soup.select_one(sel)
        if el:
            out[key] = _text(el)

    # 옵션(컬러/사이즈) — select 및 카페24 옵션 스크립트 양쪽에서 수집
    options: dict[str, list[str]] = {}
    for sel in soup.select("select"):
        name = sel.get("name") or sel.get("id") or ""
        vals = [_text(o) for o in sel.find_all("option")
                if o.get("value") and o.get("value") not in ("*", "**")]
        if vals:
            options[name] = vals
    m = re.search(r"var\s+optionInfo\s*=\s*(\[.*?\]);", html, re.S)
    if m:
        try:
            options["_optionInfo"] = json.loads(m.group(1))
        except ValueError:
            options["_optionInfo_raw"] = m.group(1)[:4000]
    out["options"] = options

    # 상세 설명 본문 (이미지 중심 페이지라 텍스트가 적을 수 있음)
    body = soup.select_one("#prdDetail, .xans-product-detail, .cont")
    out["detail_text"] = _text(body)[:20000] if body else ""

    # 상세 이미지 URL — 사이즈표/스펙이 대부분 이미지라 목록을 남긴다
    imgs = []
    if body:
        for im in body.find_all("img"):
            src = im.get("src") or im.get("ec-data-src") or ""
            if src:
                imgs.append(src if src.startswith("http") else "https:" + src.lstrip(":"))
    out["detail_images"] = imgs[:80]

    # 사이즈 관련 숫자가 텍스트로 있으면 잡아둔다
    out["size_hints"] = re.findall(
        r"(총장|어깨|가슴|소매|밑단|암홀)\s*[:\s]*([0-9]{2,3}(?:\.[0-9])?)", out["detail_text"])

    # 리뷰 수 (게시판 카운트가 노출되는 경우)
    rv = re.search(r"(리뷰|REVIEW)\s*\(?\s*([0-9,]+)\s*\)?", html, re.I)
    out["review_count_hint"] = rv.group(2) if rv else None

    return out


# --- 2) Cafe24 Admin API ---------------------------------------------------

def pull_cafe24() -> dict:
    """Admin API 로 상품 원본(옵션·변형·재고 포함)을 가져온다.

    토큰은 daily-collect 와 동일한 규칙: DB(app_kv) 영속 토큰 우선, 없으면 env.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from cafe24_ops.clients import Cafe24Client
    from cafe24_ops.config import load_config
    from cafe24_ops.store import Store

    config = load_config()
    kv = Store(config.data_dir)
    access = kv.get_kv("cafe24_access_token")
    refresh = kv.get_kv("cafe24_refresh_token")
    client = Cafe24Client.from_config(config, access_override=access, refresh_override=refresh)

    out: dict = {"api_version": client.api_version, "mall_id": client.mall_id, "products": {}}
    try:
        for p in PRODUCTS:
            no = p["product_no"]
            entry: dict = {}
            for label, path, params in (
                ("product", f"/api/v2/admin/products/{no}", {"embed": "options,variants"}),
                ("options", f"/api/v2/admin/products/{no}/options", {}),
                ("variants", f"/api/v2/admin/products/{no}/variants", {}),
                ("inventory", f"/api/v2/admin/products/{no}/variants/inventories", {}),
                ("categories", f"/api/v2/admin/products/{no}/categories", {}),
            ):
                try:
                    entry[label] = client.get(path, params)
                except Exception as exc:  # 엔드포인트별 권한/스코프 차이를 흡수
                    entry[label] = {"_error": f"{type(exc).__name__}: {exc}"}
            out["products"][str(no)] = entry

        # 회전된 토큰 보존 (daily-collect 와 동일)
        kv.set_kv("cafe24_access_token", client.access_token)
        if client.refresh_token:
            kv.set_kv("cafe24_refresh_token", client.refresh_token)
    finally:
        client.close()
    return out


# --- 3) Instagram Graph API (business_discovery) ---------------------------

IG_MEDIA_FIELDS = ("id,caption,media_type,media_product_type,like_count,comments_count,"
                   "permalink,timestamp,thumbnail_url,media_url")


def pull_instagram(usernames: list[str], media_limit: int = 50) -> dict:
    """자사 IG 비즈니스 계정 토큰으로 '공개 비즈니스 계정' 지표를 조회한다.

    business_discovery 는 상대 계정이 비즈니스/크리에이터 계정이면 팔로워·게시물 수와
    게시물별 좋아요·댓글·캡션·시각까지 준다. (릴스 재생수는 이 경로로 제공되지 않음)
    """
    token = os.environ.get("PSLAB_INSTAGRAM_ACCESS_TOKEN") or os.environ.get("INSTAGRAM_ACCESS_TOKEN")
    ig_user = os.environ.get("PSLAB_INSTAGRAM_IG_USER_ID") or os.environ.get("INSTAGRAM_IG_USER_ID")
    if not token or not ig_user:
        raise RuntimeError(
            "PSLAB_INSTAGRAM_ACCESS_TOKEN / PSLAB_INSTAGRAM_IG_USER_ID 가 없습니다.")

    out: dict = {"queried_by_ig_user_id": ig_user, "accounts": {}}
    with httpx.Client(timeout=60) as c:
        for uname in usernames:
            fields = (
                f"business_discovery.username({uname})"
                "{username,name,biography,website,followers_count,follows_count,media_count,"
                f"profile_picture_url,media.limit({media_limit}){{{IG_MEDIA_FIELDS}}}}}"
            )
            r = c.get(f"https://graph.facebook.com/{GRAPH_VERSION}/{ig_user}",
                      params={"fields": fields, "access_token": token})
            if r.status_code != 200:
                out["accounts"][uname] = {
                    "_error": f"HTTP {r.status_code}",
                    "_body": r.text[:800],
                }
                continue
            data = r.json().get("business_discovery")
            if not data:
                out["accounts"][uname] = {"_error": "business_discovery 없음(비공개/개인계정/미존재)"}
                continue
            media = (data.get("media") or {}).get("data") or []
            likes = [m.get("like_count") or 0 for m in media]
            cmts = [m.get("comments_count") or 0 for m in media]
            followers = data.get("followers_count") or 0
            data["_stats"] = {
                "sampled_media": len(media),
                "avg_likes": round(sum(likes) / len(likes), 1) if likes else 0,
                "avg_comments": round(sum(cmts) / len(cmts), 1) if cmts else 0,
                "max_likes": max(likes) if likes else 0,
                "engagement_rate_pct": (
                    round((sum(likes) + sum(cmts)) / len(media) / followers * 100, 3)
                    if media and followers else None),
                "by_product_type": _count_by(media, "media_product_type"),
                "by_media_type": _count_by(media, "media_type"),
                "top5_by_likes": [
                    {"permalink": m.get("permalink"), "like_count": m.get("like_count"),
                     "comments_count": m.get("comments_count"),
                     "media_product_type": m.get("media_product_type"),
                     "timestamp": m.get("timestamp"),
                     "caption": (m.get("caption") or "")[:220]}
                    for m in sorted(media, key=lambda x: x.get("like_count") or 0, reverse=True)[:5]
                ],
            }
            out["accounts"][uname] = data
    return out


def _count_by(rows: list[dict], key: str) -> dict:
    acc: dict[str, int] = {}
    for r in rows:
        acc[r.get(key) or "UNKNOWN"] = acc.get(r.get(key) or "UNKNOWN", 0) + 1
    return acc


# --- 상세 덤프 (아티팩트를 못 받는 환경을 위해 로그로 전부 출력) ----------------

def _kst(ts: str) -> "tuple[str, str, int]":
    """ISO8601(+0000) → (YYYY-MM-DD, 요일, 시) KST 변환."""
    from datetime import datetime, timedelta, timezone
    try:
        dt = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S%z").astimezone(timezone(timedelta(hours=9)))
    except (ValueError, TypeError):
        return ("?", "?", -1)
    return (dt.strftime("%Y-%m-%d"), "월화수목금토일"[dt.weekday()], dt.hour)


def dump_storefront(rows: list[dict]) -> None:
    for d in rows:
        print(f"\n--- [storefront] product_no={d.get('product_no')} ---")
        print(f"og_title    : {d.get('og_title')}")
        print(f"og_desc     : {(d.get('og_description') or '')[:400]}")
        print(f"price       : sale={d.get('price_sale')} org={d.get('price_org')} "
              f"custom={d.get('price_custom')}")
        print(f"review_hint : {d.get('review_count_hint')}")
        print("detail_table:")
        for k, v in (d.get("detail_table") or {}).items():
            print(f"   - {k}: {v[:200]}")
        print("options:")
        for k, v in (d.get("options") or {}).items():
            if isinstance(v, list):
                print(f"   - {k}: {v[:40]}")
            else:
                print(f"   - {k}: {json.dumps(v, ensure_ascii=False)[:1500]}")
        print(f"size_hints  : {d.get('size_hints')}")
        txt = (d.get("detail_text") or "").strip()
        print(f"detail_text ({len(txt)}자):")
        for line in [txt[i:i + 180] for i in range(0, min(len(txt), 4000), 180)]:
            print(f"   {line}")
        print(f"detail_images ({len(d.get('detail_images') or [])}):")
        for u in (d.get("detail_images") or [])[:15]:
            print(f"   {u}")


def dump_cafe24(data: dict) -> None:
    keep = ("product_no", "product_code", "product_name", "eng_product_name", "model_name",
            "price", "retail_price", "supply_price", "display", "selling", "product_condition",
            "summary_description", "simple_description", "made_in_code", "brand_code",
            "created_date", "updated_date", "sold_out", "product_weight", "origin_place_value")
    for no, entry in (data.get("products") or {}).items():
        print(f"\n--- [cafe24] product_no={no} ---")
        prod = (entry.get("product") or {}).get("product") or {}
        if not prod and isinstance(entry.get("product"), dict):
            print(f"product error: {json.dumps(entry['product'], ensure_ascii=False)[:600]}")
        for k in keep:
            if k in prod:
                v = prod[k]
                print(f"   {k}: {json.dumps(v, ensure_ascii=False)[:500]}")
        desc = prod.get("description") or ""
        if desc:
            plain = re.sub(r"<[^>]+>", " ", desc)
            plain = re.sub(r"\s+", " ", plain).strip()
            print(f"   description(태그제거 {len(plain)}자):")
            for i in range(0, min(len(plain), 6000), 200):
                print(f"      {plain[i:i + 200]}")
        for label in ("options", "inventory", "categories"):
            v = entry.get(label)
            print(f"   [{label}] {json.dumps(v, ensure_ascii=False)[:2500]}")
        # variants 는 컬러×사이즈 전수라 잘리면 쓸모없다 → 표로 전량 출력
        vs = ((entry.get("variants") or {}).get("variants")
              if isinstance(entry.get("variants"), dict) else None)
        if vs is None:
            print(f"   [variants] {json.dumps(entry.get('variants'), ensure_ascii=False)[:800]}")
        else:
            print(f"   [variants] {len(vs)}건 — 변형코드 | 옵션 | 자체코드 | 진열 | 판매 | 재고")
            for v in vs:
                opt = " / ".join(f"{o.get('name')}={o.get('value')}" for o in (v.get("options") or []))
                print(f"      {v.get('variant_code')} | {opt} | {v.get('custom_variant_code')} | "
                      f"{v.get('display')} | {v.get('selling')} | {v.get('quantity')}")


def dump_instagram(data: dict) -> None:
    for uname, acc in (data.get("accounts") or {}).items():
        print(f"\n--- [instagram] @{uname} ---")
        if "_error" in acc:
            print(f"   ERROR {acc['_error']} {acc.get('_body', '')[:400]}")
            continue
        print(f"   name={acc.get('name')} followers={acc.get('followers_count')} "
              f"media={acc.get('media_count')} website={acc.get('website')}")
        print(f"   bio: {(acc.get('biography') or '')}")
        media = (acc.get("media") or {}).get("data") or []
        # 게시물 표 (최신순)
        print(f"   게시물 {len(media)}건 (날짜 | 요일 | KST시 | 포맷 | ♥ | 💬 | 훅 첫 줄)")
        tags: dict[str, int] = {}
        wd: dict[str, int] = {}
        hr: dict[int, int] = {}
        mon: dict[str, int] = {}
        for m in media:
            date, w, h = _kst(m.get("timestamp") or "")
            cap = (m.get("caption") or "").strip()
            first = cap.split("\n")[0][:70]
            print(f"     {date} {w} {h:02d}시 {m.get('media_product_type'):5} "
                  f"♥{m.get('like_count') or 0:4} 💬{m.get('comments_count') or 0:3} | {first}")
            for t in re.findall(r"#([0-9A-Za-z가-힣_ぁ-んァ-ン一-龥]+)", cap):
                tags[t] = tags.get(t, 0) + 1
            wd[w] = wd.get(w, 0) + 1
            hr[h] = hr.get(h, 0) + 1
            mon[date[:7]] = mon.get(date[:7], 0) + 1
        print(f"   해시태그 TOP20: "
              f"{sorted(tags.items(), key=lambda x: -x[1])[:20]}")
        print(f"   요일분포: {sorted(wd.items(), key=lambda x: '월화수목금토일'.index(x[0]) if x[0] in '월화수목금토일' else 9)}")
        print(f"   시간분포: {sorted(hr.items())}")
        print(f"   월별발행: {sorted(mon.items())}")


# --- 실행 ------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out", help="JSON 저장 디렉터리")
    ap.add_argument("--only", default="", help="storefront,cafe24,instagram 중 콤마 구분 선택")
    ap.add_argument("--ig-users", default=",".join(DEFAULT_IG_USERS))
    ap.add_argument("--ig-media-limit", type=int, default=50)
    ap.add_argument("--dump", action="store_true",
                    help="아티팩트를 못 받는 환경용 — 수집 원본을 로그에 전부 출력")
    args = ap.parse_args()

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    want = lambda name: not only or name in only  # noqa: E731

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)
    failures = []

    if want("storefront"):
        print("\n=== 1) 스토어프론트 (keek-line.com) ===", flush=True)
        results = []
        for p in PRODUCTS:
            try:
                d = scrape_storefront(p)
                results.append(d)
                print(f"[OK] {p['product_no']} {d.get('og_title') or d.get('title')}")
                print(f"     price={d.get('price_sale')} html={d.get('html_bytes')}B "
                      f"imgs={len(d.get('detail_images') or [])} "
                      f"opts={list((d.get('options') or {}).keys())[:6]}")
                if d.get("size_hints"):
                    print(f"     size_hints={d['size_hints'][:12]}")
            except Exception as exc:
                failures.append(f"storefront/{p['product_no']}: {exc}")
                print(f"[FAIL] {p['product_no']}: {type(exc).__name__}: {exc}")
        (outdir / "storefront.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.dump:
            dump_storefront(results)

    if want("cafe24"):
        print("\n=== 2) Cafe24 Admin API ===", flush=True)
        try:
            d = pull_cafe24()
            (outdir / "cafe24.json").write_text(
                json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
            for no, entry in d["products"].items():
                prod = (entry.get("product") or {}).get("product") or {}
                print(f"[OK] {no} {prod.get('product_name')} / "
                      f"판매가 {prod.get('price')} / 코드 {prod.get('product_code')} / "
                      f"진열 {prod.get('display')} 판매 {prod.get('selling')}")
                for label in ("options", "variants", "inventory", "categories"):
                    v = entry.get(label)
                    mark = "err" if isinstance(v, dict) and "_error" in v else "ok"
                    print(f"     - {label}: {mark}")
            if args.dump:
                dump_cafe24(d)
        except Exception as exc:
            failures.append(f"cafe24: {exc}")
            print(f"[FAIL] cafe24: {type(exc).__name__}: {exc}")

    if want("instagram"):
        print("\n=== 3) Instagram Graph API (business_discovery) ===", flush=True)
        try:
            users = [u.strip() for u in args.ig_users.split(",") if u.strip()]
            d = pull_instagram(users, args.ig_media_limit)
            (outdir / "instagram.json").write_text(
                json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
            for uname, acc in d["accounts"].items():
                if "_error" in acc:
                    print(f"[--] @{uname}: {acc['_error']} {acc.get('_body', '')[:200]}")
                    continue
                s = acc["_stats"]
                print(f"[OK] @{uname} ({acc.get('name')}) "
                      f"팔로워 {acc.get('followers_count'):,} / 게시물 {acc.get('media_count'):,}")
                print(f"     bio: {(acc.get('biography') or '')[:120]}")
                print(f"     표본 {s['sampled_media']}건 · 평균 좋아요 {s['avg_likes']} · "
                      f"평균 댓글 {s['avg_comments']} · 참여율 {s['engagement_rate_pct']}%")
                print(f"     포맷 {s['by_product_type']}")
                for t in s["top5_by_likes"]:
                    print(f"       ♥{t['like_count']} 💬{t['comments_count']} "
                          f"{t['media_product_type']} {t['timestamp']} {t['permalink']}")
                    print(f"         {t['caption']}")
            if args.dump:
                dump_instagram(d)
        except Exception as exc:
            failures.append(f"instagram: {exc}")
            print(f"[FAIL] instagram: {type(exc).__name__}: {exc}")

    print("\n=== 결과 ===")
    if failures:
        for f in failures:
            print(f"::warning::{f}")
    print(f"저장: {', '.join(sorted(p.name for p in outdir.glob('*.json'))) or '(없음)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
