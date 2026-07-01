---
name: cafe24-ops-status
description: 카페24 자사몰 통합 자동화 운영현황 대시보드. 데일리(매일 1회)로 카페24 Admin API·광고 플랫폼·소재·경쟁사 데이터를 수집/정규화/집계해 React 대시보드에 제공한다. 카페24 운영현황, 매출/광고/소재/경쟁사 대시보드를 만들거나 데이터를 수집/갱신할 때 사용.
---

# cafe24-ops-status

자사몰(카페24) 운영을 위한 **통합 자동화 운영현황 대시보드**. 데이터를 데일리로
무인 수집하여 4대 대시보드(카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링)를 채운다.

설계도면: [`docs/afe24-ops-dashboard/`](../../docs/afe24-ops-dashboard/) (저장소 루트 기준)

## 현재 상태 — 라이브 운영 중 (무료 스택 전체 가동)

수집 → 정규화 → 집계 → Neon 저장 → API → React(4탭) 전체가 **실데이터로** 동작한다.
업체 온보딩/오류 대응 런북은 스킬 **`카페24-운영현황`**(`.claude/skills/카페24-운영현황/`) 참고.

- **4대 대시보드**: 카페24 어드민 / 광고 / 광고 히스토리(소재 이미지+성과) / 경쟁사 모니터링
- **live 연동(가동)**: 카페24 Admin API(매출/주문/객단가 + GA4 방문자·전환 + 가입/후기/품절/카테고리/디바이스),
  Meta 광고(계정 + 소재별 이미지·성과), 네이버 검색광고(ROAS), 경쟁사(네이버 DataLab/검색)
- `mock` 모드: 샘플 데이터(같은 날짜=같은 값) — 연동 전 흐름 검증용
- **무료 스택**: Neon Postgres(영속) · Render Web(웹/API) · GitHub Actions(데일리 수집 + 10분 keepalive)
- **자동화**: `cafe24-daily-collect.yml`(08:00 KST) · `keek-dashboard-keepalive.yml`(콜드스타트 방지) ·
  `cafe24-verify.yml`(정확도) · `keek-api-smoke.yml`(엔드포인트 200 점검) · 알림(`scripts/notify.py`, Slack 홀딩)

### 주요 API
```
/api/config/metrics · /api/summary · /api/period-comparison · /api/daily · /api/daily-detail · /api/trend
/api/ads/summary · /api/ads/channels · /api/ads/trend
/api/creatives · /api/creatives/fatigue · /api/creatives/trend
/api/competitors · /api/competitors/trend
```

## 빠른 시작

```bash
# 단일 서비스 (API + 대시보드 한 번에)
docker compose up --build          # → http://localhost:8000

# 또는 로컬 개발 (핫리로드: API :8000 + 대시보드 :5173)
./scripts/dev.sh
```

## 수동 실행

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

python scripts/smoke_live.py --check               # 자격증명·연결 점검(쓰기 없음)
python scripts/smoke_live.py --date 2026-06-17     # 1일 실수집 스모크
python scripts/run_all.py --mode live --date 2026-06-17
```

자세한 절차/트러블슈팅: [`SMOKE.md`](SMOKE.md)

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

## 완료된 연동 (Phase 1~4 전부 가동)

- ✅ 카페24 Admin API(매출/주문/객단가/방문자/전환/가입/후기/품절/카테고리/디바이스)
- ✅ 광고: Meta(계정+소재 이미지·성과), 네이버 검색광고(ROAS) — Google/Kakao는 키만 넣으면 대기 중
- ✅ 소재(광고 히스토리): Meta ad-level insights + 썸네일, 기간별 성과 카드
- ✅ 경쟁사: 네이버 DataLab/검색 트렌드
- ✅ GA4 방문자·전환율, GitHub Actions 무인 데일리 + keepalive + 알림

## 다음 후보

- Google Ads / Kakao Moment 토큰 승인(키만 채우면 커넥터 대기 중)
- 순매출/환불·취소, GA4 신규·재방문 세그먼트 등 `metrics.yaml`의 ⛔ 미연동 지표
- 신규 업체 온보딩은 스킬 `카페24-운영현황` 런북대로 진행
