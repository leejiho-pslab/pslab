from cafe24_ops.config import load_config
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.store import Store


def test_database_url_sqlite(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'custom.db'}"
    monkeypatch.setenv("DATABASE_URL", url)
    cfg = load_config()
    store = Store(tmp_path)
    try:
        assert store.db.dialect == "sqlite"
        run_pipeline("2026-06-17", cfg, store, mode="mock")
        assert (tmp_path / "custom.db").exists()
        assert store.count_facts() > 0
        assert "2026-06-17" in store.list_dates()
    finally:
        store.close()


def test_explicit_db_url_overrides_env(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    store = Store(tmp_path, db_url="sqlite:///:memory:")
    try:
        assert store.db.dialect == "sqlite"
        store.upsert_kpi("2026-06-17", {"gross_sales": 100.0})
        assert store.get_kpi("2026-06-17")["gross_sales"] == 100.0
    finally:
        store.close()
