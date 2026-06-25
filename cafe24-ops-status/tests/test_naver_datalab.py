import httpx

from cafe24_ops.clients.naver_datalab import NaverDataLabClient, naver_trend_to_facts

SAMPLE = {
    "results": [
        {"title": "데일리핏", "keywords": ["데일리핏"],
         "data": [{"period": "2026-06-16", "ratio": 80.0}, {"period": "2026-06-17", "ratio": 100.0}]},
        {"title": "무브웨어", "keywords": ["무브웨어"],
         "data": [{"period": "2026-06-16", "ratio": 40.0}, {"period": "2026-06-17", "ratio": 55.5}]},
    ]
}


def test_naver_trend_mapping():
    facts = naver_trend_to_facts(SAMPLE)
    assert len(facts) == 4
    f = facts[0]
    assert f["metric"] == "naver_search_volume" and f["source"] == "competitor"
    assert f["dims"]["competitor"] == "데일리핏" and f["date"] == "2026-06-16"
    # 마지막 무브웨어 값
    assert facts[-1]["value"] == 55.5


def test_naver_client_fetch_with_mock_transport():
    captured = {}

    def handler(req):
        captured["path"] = req.url.path
        captured["cid"] = req.headers.get("X-Naver-Client-Id")
        return httpx.Response(200, json=SAMPLE)

    client = NaverDataLabClient("cid", "sec", transport=httpx.MockTransport(handler))
    facts = client.fetch_search_facts("2026-06-16", "2026-06-17", ["데일리핏", "무브웨어"])
    assert captured["path"] == "/v1/datalab/search"
    assert captured["cid"] == "cid"
    assert len(facts) == 4
    client.close()


def test_naver_fetch_empty_competitors():
    client = NaverDataLabClient("cid", "sec", transport=httpx.MockTransport(lambda r: httpx.Response(200, json={})))
    assert client.fetch_search_facts("2026-06-16", "2026-06-17", []) == []
    client.close()
