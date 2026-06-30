from cafe24_ops.store import Store


def test_delete_kv(tmp_path):
    s = Store(tmp_path)
    try:
        s.set_kv("meta_access_token", "x")
        assert s.get_kv("meta_access_token") == "x"
        assert s.delete_kv("meta_access_token") == 1
        assert s.get_kv("meta_access_token") is None
        assert s.delete_kv("nope") == 0   # 없는 키는 0
    finally:
        s.close()
