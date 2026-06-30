"""데이터 저장소 — facts(정규화) + kpi(집계) + raw 스냅샷.

DATABASE_URL 로 SQLite(기본·로컬) / Postgres(운영) 전환. 접근은 이 모듈의 메서드로만 한다.
raw JSON 스냅샷은 로컬 파일로도 보관한다(재처리/감사용).
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .db import Database
from .models import Fact


class Store:
    def __init__(self, data_dir: Path, db_url: str | None = None):
        self.data_dir = Path(data_dir)
        self.raw_dir = self.data_dir / "data" / "raw"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.raw_dir.mkdir(parents=True, exist_ok=True)

        url = db_url or os.environ.get("DATABASE_URL") or f"sqlite:///{self.data_dir / 'ops.db'}"
        self.db = Database(url)
        self.db_path = url
        self._init_schema()

    def _init_schema(self) -> None:
        self.db.execute_script([
            f"""CREATE TABLE IF NOT EXISTS raw_snapshots (
                id        {self.db.autoincrement_pk},
                date      TEXT NOT NULL,
                source    TEXT NOT NULL,
                payload   TEXT NOT NULL,
                created_at TEXT NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS facts (
                date   TEXT NOT NULL,
                source TEXT NOT NULL,
                metric TEXT NOT NULL,
                value  REAL NOT NULL,
                dims   TEXT NOT NULL DEFAULT '{}',
                PRIMARY KEY (date, source, metric, dims)
            )""",
            """CREATE TABLE IF NOT EXISTS kpi_daily (
                date   TEXT NOT NULL,
                metric TEXT NOT NULL,
                value  REAL NOT NULL,
                PRIMARY KEY (date, metric)
            )""",
            """CREATE TABLE IF NOT EXISTS app_kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )""",
        ])

    # ---- key-value (토큰 등 회전값 영속화) -------------------------
    def get_kv(self, key: str) -> str | None:
        row = self.db.execute("SELECT value FROM app_kv WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None

    def set_kv(self, key: str, value: str) -> None:
        self.db.execute(
            "INSERT INTO app_kv(key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )
        self.db.commit()

    # ---- 쓰기 -------------------------------------------------------
    def save_raw(self, date: str, source: str, records: list[dict]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = json.dumps(records, ensure_ascii=False)
        self.db.execute(
            "INSERT INTO raw_snapshots(date, source, payload, created_at) VALUES (?,?,?,?)",
            (date, source, payload, now),
        )
        self.db.commit()
        out = self.raw_dir / date
        out.mkdir(parents=True, exist_ok=True)
        (out / f"{source}.json").write_text(payload, encoding="utf-8")

    def upsert_facts(self, facts: list[Fact]) -> int:
        rows = [(f.date, f.source, f.metric, f.value, f.dims_json) for f in facts]
        self.db.executemany(
            "INSERT INTO facts(date, source, metric, value, dims) VALUES (?,?,?,?,?) "
            "ON CONFLICT(date, source, metric, dims) DO UPDATE SET value=excluded.value",
            rows,
        )
        self.db.commit()
        return len(rows)

    def delete_facts(self, date: str, source: str) -> int:
        """해당 일자·소스의 기존 facts 삭제(재수집 시 차원이 바뀐 낡은 행 제거).

        예: 카테고리 매핑이 바뀌면 dims(category)가 달라져 upsert 로는 옛 '기타' 행이
        남아 합계가 중복된다. 재삽입 전에 비워서 깨끗이 교체한다.
        """
        cur = self.db.execute("DELETE FROM facts WHERE date=? AND source=?", (date, source))
        self.db.commit()
        return getattr(cur, "rowcount", 0) or 0

    def upsert_kpi(self, date: str, kpis: dict[str, float]) -> int:
        rows = [(date, k, float(v)) for k, v in kpis.items()]
        self.db.executemany(
            "INSERT INTO kpi_daily(date, metric, value) VALUES (?,?,?) "
            "ON CONFLICT(date, metric) DO UPDATE SET value=excluded.value",
            rows,
        )
        self.db.commit()
        return len(rows)

    # ---- 읽기 -------------------------------------------------------
    def get_kpi(self, date: str) -> dict[str, float]:
        cur = self.db.execute("SELECT metric, value FROM kpi_daily WHERE date=?", (date,))
        return {r["metric"]: r["value"] for r in cur.fetchall()}

    def get_daily(self, date_from: str, date_to: str) -> list[dict]:
        cur = self.db.execute(
            "SELECT date, metric, value FROM kpi_daily WHERE date BETWEEN ? AND ? ORDER BY date, metric",
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
        for r in self.db.execute(q, params).fetchall():
            d = dict(r)
            d["dims"] = json.loads(d.get("dims") or "{}")
            out.append(d)
        return out

    def list_dates(self) -> list[str]:
        cur = self.db.execute("SELECT DISTINCT date FROM kpi_daily ORDER BY date")
        return [r["date"] for r in cur.fetchall()]

    def count_facts(self) -> int:
        return self.db.execute("SELECT COUNT(*) AS c FROM facts").fetchone()["c"]

    def close(self) -> None:
        self.db.close()
