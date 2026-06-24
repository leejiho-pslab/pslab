"""DB 추상화 — DATABASE_URL 로 SQLite(기본) / Postgres(운영) 모두 지원.

- sqlite:///path/to.db  (기본)
- postgresql://user:pass@host:5432/dbname  (운영)

쿼리는 `?` 플레이스홀더로 작성하고, Postgres 에서는 `%s` 로 자동 변환한다.
행은 양쪽 모두 dict 처럼 r["col"] 로 접근 가능하다.
"""
from __future__ import annotations


class Database:
    def __init__(self, url: str):
        self.url = url
        self.dialect = "postgres" if url.startswith(("postgres://", "postgresql://")) else "sqlite"
        if self.dialect == "postgres":
            import psycopg
            from psycopg.rows import dict_row

            self.conn = psycopg.connect(url, row_factory=dict_row, autocommit=False)
            self._ph = "%s"
        else:
            import sqlite3

            path = url
            for prefix in ("sqlite:///", "sqlite://"):
                if path.startswith(prefix):
                    path = path[len(prefix):]
                    break
            self.conn = sqlite3.connect(path or ":memory:")
            self.conn.row_factory = sqlite3.Row
            self._ph = "?"

    def _q(self, sql: str) -> str:
        return sql if self._ph == "?" else sql.replace("?", self._ph)

    @property
    def autoincrement_pk(self) -> str:
        return "BIGSERIAL PRIMARY KEY" if self.dialect == "postgres" else "INTEGER PRIMARY KEY AUTOINCREMENT"

    def execute(self, sql: str, params=()):
        cur = self.conn.cursor()
        cur.execute(self._q(sql), tuple(params))
        return cur

    def executemany(self, sql: str, seq):
        cur = self.conn.cursor()
        cur.executemany(self._q(sql), [tuple(p) for p in seq])
        return cur

    def execute_script(self, statements: list[str]) -> None:
        for stmt in statements:
            if stmt.strip():
                self.execute(stmt)
        self.conn.commit()

    def commit(self) -> None:
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()
