import httpx

import cafe24_ops.clients.ads_naver as ads_naver
from cafe24_ops.clients.ads_naver import NaverSearchAdClient, naver_sa_keyword_rows_to_facts
from cafe24_ops.config import load_config
from cafe24_ops.etl.keyword_metrics import keyword_channels, keyword_report, keyword_summary
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


# ── 순수 매핑 ────────────────────────────────────────────────────
def test_keyword_rows_to_facts_maps_by_id():
    id_meta = {
        "kw-1": {"keyword": "주방인테리어", "campaign": "파워링크", "adgroup": "키워드",
                 "channel": "naver_powerlink"},
    }
    rows = [{"id": "kw-1", "salesAmt": "831468", "impCnt": "12153", "clkCnt": "576",
             "ccnt": "0", "convAmt": "0"},
            {"id": "unknown", "salesAmt": "999"}]  # 메타에 없는 id 는 무시
    facts = naver_sa_keyword_rows_to_facts("2026-07-03", rows, id_meta)
    by = {f["metric"]: f["value"] for f in facts}
    assert by["ad_cost"] == 831468.0 and by["impressions"] == 12153.0 and by["clicks"] == 576.0
    assert all(f["dims"]["keyword"] == "주방인테리어" for f in facts)
    assert all(f["source"] == "naver_keyword" for f in facts)


# ── 라이브 흐름(캠페인→광고그룹→키워드→stats) ───────────────────
_META_CALLS: dict = {}


def test_fetch_keyword_facts_flow():
    ads_naver._ID_META_CACHE.clear()  # 프로세스 캐시 초기화(테스트 순서 무관하게)
    _META_CALLS.clear()
    _META_CALLS.update({"campaigns": 0})

    def handler(req: httpx.Request) -> httpx.Response:
        p = req.url.path
        if p == "/ncc/campaigns":
            _META_CALLS["campaigns"] += 1
            return httpx.Response(200, json=[
                {"nccCampaignId": "cmp-pl", "campaignTp": "WEB_SITE", "name": "파워링크"},
                {"nccCampaignId": "cmp-pc", "campaignTp": "PLACE", "name": "플레이스"},
            ])
        if p == "/ncc/adgroups":
            cid = req.url.params.get("nccCampaignId")
            if cid == "cmp-pl":
                return httpx.Response(200, json=[{"nccAdgroupId": "ag-pl", "name": "키워드그룹"}])
            return httpx.Response(200, json=[{"nccAdgroupId": "ag-pc", "name": "플레이스그룹"}])
        if p == "/ncc/keywords":
            return httpx.Response(200, json=[
                {"nccKeywordId": "kw-1", "keyword": "주방인테리어"},
                {"nccKeywordId": "kw-2", "keyword": "욕실인테리어"},
            ])
        if p == "/stats":
            ids = req.url.params.get_list("ids")
            # /stats 한 호출의 ids 는 동일 엔티티 유형이어야 함(섞으면 네이버 400)
            prefixes = {i.split("-")[0] for i in ids}
            assert len(prefixes) == 1, f"mixed entity ids in one /stats call: {prefixes}"
            # 실 API 는 한 번의 호출로 요청한 모든 id 의 per-id 행을 함께 준다.
            pool = {
                "kw-1": {"id": "kw-1", "salesAmt": "831468", "impCnt": "12153", "clkCnt": "576",
                         "ccnt": "1", "convAmt": "0"},
                "kw-2": {"id": "kw-2", "salesAmt": "295431", "impCnt": "4714", "clkCnt": "204",
                         "ccnt": "0", "convAmt": "0"},
                "ag-pc": {"id": "ag-pc", "salesAmt": "215183", "impCnt": "1407", "clkCnt": "48",
                          "ccnt": "0", "convAmt": "0"},
            }
            data = [pool[i] for i in ids if i in pool]
            return httpx.Response(200, json={"data": data})
        return httpx.Response(404)

    c = NaverSearchAdClient("key", "sec", "cust", timestamp_fn=lambda: "1",
                            transport=httpx.MockTransport(handler))
    facts = c.fetch_keyword_facts("2026-07-03")
    # 같은 계정 두 번째 날 조회 시 메타 재크롤 없이 캐시 사용(백필 성능)
    calls_before = dict(_META_CALLS)
    c.fetch_keyword_facts("2026-07-02")
    assert _META_CALLS["campaigns"] == calls_before["campaigns"]  # 캠페인 목록 재조회 안 함
    c.close()

    # 키워드/광고그룹 단위로 dims 가 나뉘어야 함
    kw_cost = {(f["dims"]["keyword"], f["dims"]["channel"]): f["value"]
               for f in facts if f["metric"] == "ad_cost"}
    assert kw_cost[("주방인테리어", "naver_powerlink")] == 831468.0
    assert kw_cost[("욕실인테리어", "naver_powerlink")] == 295431.0
    assert kw_cost[("-", "naver_place")] == 215183.0  # 플레이스 광고그룹 단위


# ── ETL 집계·정렬 ────────────────────────────────────────────────
def test_keyword_report_sorted_by_cost(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    try:
        run_pipeline("2026-07-03", cfg, store, mode="mock")
        assert set(keyword_channels(store, "2026-07-03", "2026-07-03")) == {"naver_powerlink", "naver_place"}
        rows = keyword_report(store, "2026-07-03", "2026-07-03", channel="naver_powerlink")
        assert len(rows) >= 1
        costs = [r["ad_cost"] for r in rows]
        assert costs == sorted(costs, reverse=True)  # 광고비 소진 기준 내림차순
        assert rows[0]["ctr"] is not None and rows[0]["cpc"] is not None
        s = keyword_summary(store, "2026-07-03", "2026-07-03", "naver_powerlink")
        assert s["keyword_count"] == len(rows) and s["ad_cost"] > 0
    finally:
        store.close()
