from cafe24_ops.config import load_config
from cafe24_ops.etl.monthly_report import (
    monthly_report_data,
    month_range,
    prev_month,
)
from cafe24_ops.pipeline import run_pipeline
from cafe24_ops.report_docx import build_report_docx
from cafe24_ops.store import Store


def _seed(tmp_path):
    cfg = load_config()
    store = Store(tmp_path)
    for d in ["2026-05-10", "2026-05-20", "2026-06-10", "2026-06-20", "2026-06-25"]:
        run_pipeline(d, cfg, store, mode="mock")
    return store


def test_month_helpers():
    assert month_range("2026-06") == ("2026-06-01", "2026-06-30")
    assert month_range("2026-02") == ("2026-02-01", "2026-02-28")
    assert prev_month("2026-01") == "2025-12"
    assert prev_month("2026-07") == "2026-06"


def test_monthly_report_structure(tmp_path):
    store = _seed(tmp_path)
    try:
        r = monthly_report_data(store, "2026-06")
        assert r["target"] == "2026-06" and r["compare"] == "2026-05"
        assert len(r["kpi_rows"]) == 8
        assert {"결과 (문의·전환)", "전환당 비용 (CPA)"} <= {k["label"] for k in r["kpi_rows"]}
        assert len(r["channel_rows"]) >= 1
        assert r["improved"] and r["declined"]
        assert len(r["strategy_draft"]) == 5
        # 증감 방향 라벨이 셋 중 하나
        assert all(k["delta"]["dir"] in ("good", "bad", "flat") for k in r["kpi_rows"])
    finally:
        store.close()


def test_cpa_delta_direction_is_lower_is_better(tmp_path):
    # CPA 는 낮아지면 'good' 이어야 한다(positive_good=False)
    store = _seed(tmp_path)
    try:
        r = monthly_report_data(store, "2026-06")
        cpa = next(k for k in r["kpi_rows"] if k["label"].startswith("전환당 비용"))
        pct = cpa["delta"].get("pct")
        if pct is not None and abs(pct) >= 0.05:
            assert (cpa["delta"]["dir"] == "good") == (pct < 0)
    finally:
        store.close()


def test_build_docx_returns_valid_bytes(tmp_path):
    store = _seed(tmp_path)
    try:
        data = monthly_report_data(store, "2026-06")
    finally:
        store.close()
    blob = build_report_docx(data)
    # .docx = zip(PK) 시그니처 + 충분한 크기
    assert blob[:2] == b"PK" and len(blob) > 5000
