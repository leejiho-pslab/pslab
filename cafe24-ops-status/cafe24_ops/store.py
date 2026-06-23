"""데이터 저장소 — SQLite(정규화 facts + 집계 kpi) + raw JSON 스냅샷.

Phase 0 는 로컬 SQLite 로 시작한다. 운영 시 Postgres 로 교체할 수 있도록
접근은 이 모듈의 메서드로만 한다.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Fact

_SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_snapshots (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    date      TEXT NOT NULL,
    source    TEXT NOT NULL,
    payload   TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facts (
    date      TEXT NOT NULL,
    source    TEXT NOT NULL,
    metric    TEXT NOT NULL,
    value     REAL NOT NULL,
    dims      TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (date, source, metric, dims)
);
CREATE TABLE IF NOT EXISTS kpi_daily (
    date      TEXT NOT NULL,
    metric    TEXT NOT NULL,
    value     REAL NOT NULL,
    PRIMARY KEY (date, metric)
);
"""


class Store:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.raw_dir = self.data_dir / "data" / "raw"
        self.db_path = self.data_dir / "ops.db"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)
        self.conn.commit()

    # ---- 쓰기 -------------------------------------------------------
    def save_raw(self, date: str, source: str, records: list[dict]) -> None:
        """원천 데이터를 DB와 파일(snapshot) 양쪽에 보관한다."""
        now = datetime.now(timezone.utc).isoformat()
        payload = json.dumps(records, ensure_ascii=False)
        self.conn.execute(
            "INSERT INTO raw_snapshots(date, source, payload, created_at) VALUES (?,?,?,?)",
            (date, source, payload, now),
        )
        self.conn.commit()
        out = self.raw_dir / date
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{source}.json").write_text(payload, encoding="utf-8")

    def upsert_facts(self, facts: list[Fact]) -> int:
        rows = [(f.date, f.source, f.metric, f.value, f.dims_json) for f in facts]
        self.conn.executemany(
            "INSERT INTO facts(date, source, metric, value, dims) VALUES (?,?,?,?,?) "
            "ON CONFLICT(date, source, metric, dims) DO UPDATE SET value=excluded.value",
            rows,
        )
        self.conn.commit()
        return len(rows)

    def upsert_kpi(self, date: str, kpis: dict[str, float]) -> int:
        rows = [(date, k, float(v)) for k, v in kpis.items()]
        self.conn.executemany(
            "INSERT INTO kpi_daily(date, metric, value) VALUES (?,?,?) "
            "ON CONFLICT(date, metric) DO UPDATE SET value=excluded.value",
            rows,
        )
        self.conn.commit()
        return len(rows)

    # ---- 읽기 -------------------------------------------------------
    def get_kpi(self, date: str) -> dict[str, float]:
        cur = self.conn.execute("SELECT metric, value FROM kpi_daily WHERE date=?", (date,))
        return {r["metric"]: r["value"] for r in cur.fetchall()}

    def get_daily(self, date_from: str, date_to: str) -> list[dict]:
        cur = self.conn.execute(
            "SELECT date, metric, value FROM kpi_daily WHERE date BETWEEN ? AND ? "
            "ORDER BY date, metric",
            (date_from, date_to),
        )
        return [dict(r) for r in cur.fetchall()]

    def get_facts(
        self, date_from: str, date_to: str, source: str | None = None, metric: str | None = None
    ) -> list[dict]:
        q = "SELECT date, source, metric, value, dims FROM facts WHERE date BETWEEN ? AND ?"
        params: list = [date_from, date_to]
        if source:
            q += " AND source=?"
            params.append(source)
        if metric:
            q += " AND metric=?"
            params.append(metric)
        out = []
        for r in self.conn.execute(q, params).fetchall():
            d = dict(r)
            d["dims"] = json.loads(r["dims"] or "{}")
            out.append(d)
        return out

    def list_dates(self) -> list[str]:
        cur = self.conn.execute("SELECT DISTINCT date FROM kpi_daily ORDER BY date")
        return [r["date"] for r in cur.fetchall()]

    def count_facts(self) -> int:
        return self.conn.execute("SELECT COUNT(*) AS c FROM facts").fetchone()["c"]

    def close(self) -> None:
        self.conn.close()
