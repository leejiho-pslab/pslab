"""경쟁사 모니터링 — 지정 업체 딥링크(홈페이지/인스타/광고라이브러리) + 구글시트 소재 파싱.

딥링크는 config(sources.yaml competitors)만으로 만들며, 항상 최신·정확하고 무료다.
소재 이미지/좋아요/댓글은 대표님이 관리하는 구글시트(competitor_media)를 그대로 렌더한다
(region_status 와 동일한 서비스계정 비공개 연동). 스크래핑 없음.
"""
from __future__ import annotations

import urllib.parse

# 페북 광고 라이브러리 — active_status=active 로 '현재 라이브 중'인 광고만.
_FB_BASE = "https://www.facebook.com/ads/library/"
_FB_FIXED = (
    "active_status=active&ad_type=all&country=KR&is_targeted_country=false"
    "&media_type=all&search_type=keyword_unordered"
    "&sort_data[direction]=desc&sort_data[mode]=total_impressions"
)


def _insta_handle(raw: str) -> str:
    return (raw or "").strip().lstrip("@").rstrip("/").split("/")[-1]


def instagram_url(handle: str) -> str | None:
    h = _insta_handle(handle)
    return f"https://www.instagram.com/{h}" if h else None


def fb_ad_library_url(query: str) -> str | None:
    q = (query or "").strip()
    if not q:
        return None
    return f"{_FB_BASE}?q={urllib.parse.quote(q)}&{_FB_FIXED}"


def google_ads_url(domain: str) -> str | None:
    d = (domain or "").strip().rstrip("/")
    return f"https://adstransparency.google.com/?region=KR&domain={urllib.parse.quote(d)}" if d else None


def competitor_directory(competitors: list[dict]) -> list[dict]:
    """지정된 경쟁사 목록 → 업체별 딥링크 묶음. 순서/필드는 config 기준."""
    out: list[dict] = []
    for c in competitors or []:
        name = c.get("name")
        if not name:
            continue
        insta = c.get("insta")
        out.append({
            "name": name,
            "url": c.get("url") or None,
            "insta": _insta_handle(insta) or None,
            "insta_url": instagram_url(insta),
            "fb_ad_library_url": fb_ad_library_url(c.get("fb_query") or insta or name),
            "google_ads_url": google_ads_url(c.get("domain")),
        })
    return out


# ── 구글시트 소재 파싱 ────────────────────────────────────────────
# 헤더 이름 → 표준 키 (한/영, 공백·대소문자 무시). 첫 매칭 우선.
_HEADER_ALIASES = {
    "competitor": ["경쟁사", "업체", "업체명", "competitor", "name", "브랜드"],
    "platform": ["플랫폼", "채널", "platform", "channel"],
    "post_date": ["게시일", "날짜", "일자", "date", "postdate", "posted"],
    "image_url": ["이미지url", "이미지", "이미지주소", "image", "imageurl", "img", "thumbnail"],
    "likes": ["좋아요", "likes", "like", "하트"],
    "comments": ["댓글", "comments", "comment", "코멘트"],
    "caption": ["캡션", "내용", "문구", "caption", "text", "title"],
    "link": ["링크", "link", "url", "게시물링크", "permalink"],
}

_PLATFORM_NORM = {
    "instagram": "instagram", "insta": "instagram", "ig": "instagram", "인스타": "instagram",
    "인스타그램": "instagram",
    "meta": "meta", "facebook": "meta", "fb": "meta", "페북": "meta", "페이스북": "meta",
    "google": "google", "구글": "google", "gdn": "google",
}


def _norm(s: str) -> str:
    return "".join((s or "").lower().split()).replace("_", "").replace("-", "")


def _header_index(headers: list[str]) -> dict[str, int]:
    """헤더명 → 표준 키 열 인덱스. 정확 일치를 먼저 배정하고(열 중복 배정 방지),
    남은 키만 부분일치로 채운다. 한 열은 하나의 키에만 배정된다."""
    idx: dict[str, int] = {}
    norm_headers = [_norm(h) for h in headers]
    claimed: set[int] = set()

    # 1) 정확 일치 우선
    for key, aliases in _HEADER_ALIASES.items():
        na_set = {_norm(a) for a in aliases}
        for i, h in enumerate(norm_headers):
            if i not in claimed and h in na_set:
                idx[key] = i
                claimed.add(i)
                break

    # 2) 남은 키만 부분 일치(미배정 열 대상), 짧은 조각 오탐 방지 위해 길이>=3
    for key, aliases in _HEADER_ALIASES.items():
        if key in idx:
            continue
        for a in aliases:
            na = _norm(a)
            if len(na) < 3:
                continue
            hit = next((i for i, h in enumerate(norm_headers)
                        if i not in claimed and na in h), None)
            if hit is not None:
                idx[key] = hit
                claimed.add(hit)
                break
    return idx


def _to_int(v: str) -> int | None:
    s = (v or "").strip().replace(",", "")
    if not s:
        return None
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


def _norm_platform(v: str) -> str:
    return _PLATFORM_NORM.get(_norm(v), (v or "").strip().lower() or "instagram")


def parse_competitor_media(
    headers: list[str], rows: list[list[str]],
    date_from: str | None = None, date_to: str | None = None,
) -> list[dict]:
    """시트 (headers, rows) → 소재 아이템 리스트. 게시일이 [from,to] 범위 밖이면 제외
    (게시일이 비었거나 파싱 불가면 포함). 게시일 내림차순 정렬."""
    idx = _header_index(headers or [])
    if "competitor" not in idx and "image_url" not in idx:
        return []

    def cell(row, key):
        i = idx.get(key)
        return (row[i].strip() if i is not None and i < len(row) else "")

    items: list[dict] = []
    for row in rows or []:
        if not any((c or "").strip() for c in row):
            continue
        post_date = cell(row, "post_date")
        if post_date and date_from and date_to:
            d = post_date[:10]
            if len(d) == 10 and not (date_from <= d <= date_to):
                continue
        items.append({
            "competitor": cell(row, "competitor"),
            "platform": _norm_platform(cell(row, "platform")),
            "post_date": post_date or None,
            "image_url": cell(row, "image_url") or None,
            "likes": _to_int(cell(row, "likes")),
            "comments": _to_int(cell(row, "comments")),
            "caption": cell(row, "caption") or None,
            "link": cell(row, "link") or None,
        })
    items.sort(key=lambda x: x["post_date"] or "", reverse=True)
    return items
