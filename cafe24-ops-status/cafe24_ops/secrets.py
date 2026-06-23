"""config/secrets.env 를 읽어 환경변수로 주입한다 (이미 설정된 값은 덮어쓰지 않음)."""
from __future__ import annotations

import os
from pathlib import Path

from .config import CONFIG_DIR


def load_secrets(path: Path | None = None) -> None:
    p = path or CONFIG_DIR / "secrets.env"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)
