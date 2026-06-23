---
name: cafe24-ops-status
description: 카페24 자사몰 통합 자동화 운영현황 대시보드. 데일리(매일 1회)로 카페24 Admin API·광고 플랫폼·소재·경쟁사 데이터를 수집/정규화/집계해 React 대시보드에 제공한다. 카페24 운영현황, 매출/광고/소재/경쟁사 대시보드를 만들거나 데이터를 수집/갱신할 때 사용.
---

# cafe24-ops-status

자사몰(카페24) 운영을 위한 **통합 자동화 운영현황 대시보드**. 데이터를 데일리로
무인 수집하여 4대 대시보드(카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링)를 채운다.

설계도면: [`docs/afe24-ops-dashboard/`](../../docs/afe24-ops-dashboard/) (저장소 루트 기준)

## 현재 상태 — Phase 1 (카페24 실연동 + React 어드민 대시보드)

수집 → 정규화 → 집계 → 저장 → API → React 대시보드 전체가 동작한다.

- `mock` 모드(기본): 샘플 데이터, 같은 날짜는 항상 같은 값 (연동 전 전체 흐름 검증용)
- `live` 모드: 카페24 Admin API(주문)로 매출/주문수/객단가 실수집
  (`config/secrets.env` 에 자격증명 필요 — `secrets.env.example` 참고)
- React 어드민 대시보드: 요약 KPI · 기간 비교 · 일별 매출 추이 · 일별 지표표

## 빠른 시작

```bash
cd cafe24-ops-status
pip install -r requirements.txt

# 1) 데일리 파이프라인 1회 실행 (어제 날짜, mock)
python scripts/run_all.py

# 최근 7일 백필 + 특정일
python scripts/run_all.py --days 7 --date 2026-06-17

# 2) API 서버 (React 대시보드가 호출)
uvicorn api.main:app --reload
#  GET /health
#  GET /api/config/metrics       ← 지표 정의(metrics.yaml)
#  GET /api/summary?date=YYYY-MM-DD
#  GET /api/period-comparison?date=YYYY-MM-DD
#  GET /api/daily?from=...&to=...

# 3) React 대시보드
cd dashboard && npm install && npm run dev   # http://localhost:5173

# 4) 테스트
pytest
```

## live 모드 (카페24 실연동)

```bash
cp config/secrets.env.example config/secrets.env   # 값 채우기
#   CAFE24_MALL_ID / CAFE24_ACCESS_TOKEN / CAFE24_REFRESH_TOKEN
#   CAFE24_CLIENT_ID / CAFE24_CLIENT_SECRET (토큰 자동 갱신용)
python scripts/run_all.py --mode live --date 2026-06-17
```

## 지표 수정 (수정 자유도)

대시보드의 모든 지표(카드/표/차트)는 [`config/metrics.yaml`](config/metrics.yaml)에 선언돼 있다.
이 파일만 바꾸면 **코드 수정 없이** 지표를 추가/삭제/순서변경/이름변경할 수 있다.

## 구조

```
cafe24-ops-status/
├── config/        sources.yaml · metrics.yaml · secrets.env(.example)
├── cafe24_ops/    config · models · store · pipeline
│   ├── collectors/ cafe24 · ads · creative · competitor  (mock/live)
│   └── etl/        normalize · aggregate
├── api/           FastAPI (대시보드용 읽기 API)
├── scripts/       run_all.py (데일리 진입점)
├── tests/         설정 · 파이프라인 스모크 테스트
└── dashboard/     React 대시보드 (Phase 1)
```

## 다음 단계

- **Phase 1**: `collectors/cafe24.py`의 `collect_live` 에 카페24 Admin API 연동 + React 어드민 대시보드
- **Phase 2**: 광고 플랫폼 API(`ads.py`)
- **Phase 3**: 소재(`creative.py`)·경쟁사(`competitor.py`)
- **Phase 4**: 스케줄러 무인 운영 + 알림
