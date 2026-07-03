"""자사몰 미보유(shop.platform=none) 업체는 카페24 live 수집을 정상 스킵해야 한다.

디브릭처럼 자사몰이 없는 업체에서 매일 "cafe24 수집 실패" 오탐 경고가 뜨던 것을
방지 — 실패(Exception)가 아니라 NotImplementedError(=파이프라인이 "건너뜀"으로 처리).
"""
from __future__ import annotations

import pytest

from cafe24_ops.collectors.cafe24 import Cafe24Collector
from cafe24_ops.config import load_config


def test_cafe24_live_skips_when_no_storefront():
    cfg = load_config()  # dbrick sources.yaml: shop.platform=none
    assert cfg.sources.shop.get("platform") == "none"
    c = Cafe24Collector(cfg, mode="live")
    with pytest.raises(NotImplementedError):
        c.collect_live("2026-07-02")
