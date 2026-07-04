from cafe24_ops.etl.competitor_directory import (
    competitor_directory,
    fb_ad_library_url,
    google_ads_url,
    instagram_url,
    parse_competitor_media,
)


def test_deep_link_builders():
    assert instagram_url("@interiorteacher") == "https://www.instagram.com/interiorteacher"
    assert instagram_url("https://www.instagram.com/museumofmodernkitchen") == \
        "https://www.instagram.com/museumofmodernkitchen"
    fb = fb_ad_library_url("museumofmodernkitchen")
    assert fb.startswith("https://www.facebook.com/ads/library/?q=museumofmodernkitchen")
    assert "active_status=active" in fb            # 라이브(진행중) 광고만
    assert google_ads_url("interiorteacher.com") == \
        "https://adstransparency.google.com/?region=KR&domain=interiorteacher.com"
    assert instagram_url("") is None and fb_ad_library_url("") is None and google_ads_url("") is None


def test_competitor_directory_from_config():
    comps = [
        {"name": "뮤지엄", "url": "https://museumofmodernkitchen.com/",
         "insta": "museumofmodernkitchen", "domain": "museumofmodernkitchen.com",
         "fb_query": "museumofmodernkitchen"},
        {"name": "이름만"},  # 링크 없는 업체도 name 만 있으면 포함
    ]
    out = competitor_directory(comps)
    assert len(out) == 2
    m = out[0]
    assert m["name"] == "뮤지엄" and m["url"].startswith("https://museum")
    assert m["insta_url"].endswith("/museumofmodernkitchen")
    assert "adstransparency.google.com" in m["google_ads_url"]
    assert out[1]["insta_url"] is None and out[1]["google_ads_url"] is None


def test_parse_media_korean_headers_and_date_filter():
    headers = ["경쟁사", "플랫폼", "게시일", "이미지URL", "좋아요", "댓글", "캡션", "링크"]
    rows = [
        ["뮤지엄", "instagram", "2026-07-02", "https://img/1.jpg", "1,234", "56", "주방 리모델링", "https://insta/p1"],
        ["한건축", "meta", "2026-06-20", "https://img/2.jpg", "", "", "라이브 광고", "https://fb/2"],
        ["인테리어티쳐", "구글", "2026-05-01", "https://img/3.jpg", "10", "2", "옛날글", "https://g/3"],
    ]
    items = parse_competitor_media(headers, rows, "2026-06-04", "2026-07-03")
    # 2026-05-01 은 기간 밖 → 제외. 게시일 내림차순.
    assert [i["competitor"] for i in items] == ["뮤지엄", "한건축"]
    assert items[0]["platform"] == "instagram" and items[0]["likes"] == 1234 and items[0]["comments"] == 56
    assert items[1]["platform"] == "meta" and items[1]["likes"] is None
    assert items[0]["image_url"] == "https://img/1.jpg"


def test_parse_media_no_link_column_does_not_steal_image_url():
    # 링크 컬럼이 없을 때 'url' 부분일치가 이미지URL 열을 가로채면 안 됨(열 중복 배정 방지)
    headers = ["경쟁사", "플랫폼", "게시일", "이미지URL", "캡션"]
    rows = [["뮤지엄", "instagram", "2026-07-02", "https://img/1.jpg", "글"]]
    it = parse_competitor_media(headers, rows)[0]
    assert it["image_url"] == "https://img/1.jpg"
    assert it["link"] is None  # 이미지URL 을 링크로 잘못 매핑하지 않음


def test_parse_media_empty_headers():
    assert parse_competitor_media([], []) == []
