import httpx

from cafe24_ops.clients.cafe24_client import Cafe24Client
from cafe24_ops.config import load_config
from cafe24_ops.store import Store


def test_kv_roundtrip_persists_across_instances(tmp_path):
    s = Store(tmp_path)
    s.set_kv("cafe24_access_token", "v1")
    s.close()
    s2 = Store(tmp_path)
    try:
        assert s2.get_kv("cafe24_access_token") == "v1"
        s2.set_kv("cafe24_access_token", "v2")        # 덮어쓰기
        assert s2.get_kv("cafe24_access_token") == "v2"
        assert s2.get_kv("nope") is None
    finally:
        s2.close()


def test_from_config_prefers_override_over_env(monkeypatch):
    # 디브릭 sources.yaml 은 자사몰이 없어 mall_id 가 비어있으므로, 카페24 클라이언트
    # 자체(범용) 동작을 검증하기 위해 테스트에서만 mall_id 를 주입한다.
    monkeypatch.setenv("CAFE24_MALL_ID", "test-mall")
    monkeypatch.setenv("CAFE24_ACCESS_TOKEN", "ENVTOK")
    monkeypatch.setenv("CAFE24_REFRESH_TOKEN", "ENVREF")
    cfg = load_config()
    c = Cafe24Client.from_config(cfg, access_override="DBTOK", refresh_override="DBREF")
    try:
        assert c.access_token == "DBTOK" and c.refresh_token == "DBREF"
    finally:
        c.close()


def test_client_refreshes_and_rotates_token():
    # 401 → refresh_token 으로 갱신 → 새 access/refresh 로 회전됨(수집기가 이 값을 DB에 저장)
    state = {"first": True}

    def handler(req):
        if req.url.path == "/api/v2/oauth/token":
            return httpx.Response(200, json={"access_token": "NEW", "refresh_token": "NEWREF"})
        if state["first"]:
            state["first"] = False
            return httpx.Response(401, json={})
        return httpx.Response(200, json={"count": 5})

    c = Cafe24Client("m", "cid", "sec", "OLD", refresh_token="OLDREF",
                     transport=httpx.MockTransport(handler))
    try:
        assert c.count_orders("2026-06-23", "2026-06-23") == 5
        assert c.access_token == "NEW" and c.refresh_token == "NEWREF"
    finally:
        c.close()
