"""카페24 토큰 회전 보존 — 갱신된 refresh_token 을 DB 에 되쓰는지.

카페24는 갱신할 때마다 refresh_token 을 회전시키고 **직전 것을 즉시 무효화**한다.
읽기만 하고 되쓰지 않으면 그 실행은 성공하지만 **다음 실행이 invalid_grant 로 죽고
재인증(OAuth 승인)까지 필요**해진다. 실제로 2026-07-29 진단 스크립트가 이렇게
토큰을 끊어먹었다. 그래서 from_store 는 갱신 즉시 되쓴다.
"""
import httpx

from cafe24_ops.clients import Cafe24Client
from cafe24_ops.config import load_config
from cafe24_ops.store import Store


def _rotating_transport():
    """첫 요청은 401 → 토큰 갱신 → 재요청 성공. 갱신 시 새 refresh_token 을 회전 발급."""
    state = {"refreshed": False}

    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path == "/api/v2/oauth/token":
            state["refreshed"] = True
            return httpx.Response(200, json={
                "access_token": "NEW_ACCESS",
                "refresh_token": "NEW_REFRESH",   # ← 회전
            })
        if not state["refreshed"]:
            return httpx.Response(401, json={"error": "expired"})
        return httpx.Response(200, json={"count": 1})

    return httpx.MockTransport(handler)


def _client(tmp_path, store):
    cfg = load_config()
    cfg.data_dir = tmp_path
    store.set_kv("cafe24_access_token", "OLD_ACCESS")
    store.set_kv("cafe24_refresh_token", "OLD_REFRESH")
    return Cafe24Client.from_store(cfg, store, transport=_rotating_transport())


def test_rotated_tokens_are_written_back_to_store(tmp_path, monkeypatch):
    monkeypatch.setenv("CAFE24_MALL_ID", "testmall")
    monkeypatch.setenv("CAFE24_CLIENT_ID", "cid")
    monkeypatch.setenv("CAFE24_CLIENT_SECRET", "csec")
    store = Store(tmp_path)
    try:
        client = _client(tmp_path, store)
        client.get("/api/v2/admin/orders/count", {})
        # 갱신 직후 DB 에 새 토큰이 들어가 있어야 한다 — 여기가 핵심
        assert store.get_kv("cafe24_access_token") == "NEW_ACCESS"
        assert store.get_kv("cafe24_refresh_token") == "NEW_REFRESH"
        client.close()
    finally:
        store.close()


def test_write_back_happens_before_later_failure(tmp_path, monkeypatch):
    """갱신 후 다른 호출이 터져도 토큰은 이미 저장돼 있어야 한다.

    (예전 구조는 '수집 끝난 뒤' 저장이라 중간에 죽으면 회전 토큰을 잃었다.)
    """
    monkeypatch.setenv("CAFE24_MALL_ID", "testmall")
    monkeypatch.setenv("CAFE24_CLIENT_ID", "cid")
    monkeypatch.setenv("CAFE24_CLIENT_SECRET", "csec")
    store = Store(tmp_path)
    try:
        client = _client(tmp_path, store)
        client.get("/api/v2/admin/orders/count", {})
        try:
            client.get("/api/v2/admin/nonexistent", {})   # 이후 호출 실패 시나리오
        except httpx.HTTPError:
            pass
        assert store.get_kv("cafe24_refresh_token") == "NEW_REFRESH"
        client.close()
    finally:
        store.close()
