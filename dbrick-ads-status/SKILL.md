---
name: dbrick-ads-status
description: 디브릭(인테리어 디자인) 광고 성과 자동화 대시보드. 데일리(매일 1회)로 광고 플랫폼·소재·경쟁사 데이터를 수집/정규화/집계해 React 대시보드에 제공한다. 디브릭 광고, ROAS/소재/경쟁사 대시보드를 만들거나 데이터를 수집/갱신할 때 사용.
---

# dbrick-ads-status

디브릭(dbrick.co.kr, 프리미엄 1:1 맞춤형 인테리어 디자인 · 자사몰 없음)을 위한
**광고 성과 자동화 대시보드**. 데이터를 데일리로 무인 수집하여 3개 탭
(광고 / 광고 히스토리 / 경쟁사 모니터링)을 채운다. 카페24 자사몰이 없어
`cafe24-ops-status`의 4번째 탭(카페24 어드민)은 제외했다.

업체 온보딩/오류 대응 런북은 스킬 **`온라인-광고`**(`.claude/skills/온라인-광고/`) 참고.
연결 순서는 [`DBRICK-CONNECT-GUIDE.md`](DBRICK-CONNECT-GUIDE.md).

## 현재 상태 — 뼈대 구축 완료, 실데이터 연동 전(키 입력 대기)

수집 → 정규화 → 집계 → Neon 저장 → API → React(3탭) 코드/배포 설정은 전부 준비됐고,
DATABASE_URL 및 채널별 API 키 입력만 남았다(`DBRICK-CONNECT-GUIDE.md` 참고).

- **3개 탭**: 광고 / 광고 히스토리(소재 이미지+성과) / 경쟁사 모니터링
- **연동 예정 채널**: Meta 광고(계정 + 소재별 이미지·성과), 네이버 검색광고(ROAS),
  경쟁사(네이버 DataLab/검색) — Google/Kakao는 후순위
- `mock` 모드: 샘플 데이터(같은 날짜=같은 값) — 연동 전 흐름 검증용
- **무료 스택**: Neon Postgres(영속) · Render Web(웹/API) · GitHub Actions(데일리 수집 + 10분 keepalive)
- **자동화**: `dbrick-daily-collect.yml`(08:00 KST) · `dbrick-dashboard-keepalive.yml`(콜드스타트 방지) ·
  `dbrick-api-smoke.yml`(엔드포인트 200 점검) · 알림(`scripts/notify.py`, Slack 선택)

### 주요 API
```
/api/config/metrics · /api/dates
/api/ads/summary · /api/ads/channels · /api/ads/trend · /api/ads/overview(cmp_from,cmp_to 필수) · /api/ads/channel-trend
/api/creatives/overview · /api/creatives/fatigue · /api/creatives/trend
/api/competitors · /api/competitors/trend · /api/competitors/naver · /api/competitors/creatives · /api/competitors/best-changes
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
cd dbrick-ads-status
pip install -r requirements.txt

# 1) 데일리 파이프라인 1회 실행 (어제 날짜, mock)
python scripts/run_all.py

# 최근 7일 백필 + 특정일
python scripts/run_all.py --days 7 --date 2026-06-17

# 2) API 서버 (React 대시보드가 호출)
uvicorn api.main:app --reload
#  GET /health
#  GET /api/config/metrics       ← 지표 정의(metrics.yaml)
#  GET /api/dates

# 3) React 대시보드
cd dashboard && npm install && npm run dev   # http://localhost:5173

# 4) 테스트
pytest
```

## live 모드 (실연동)

```bash
cp config/secrets.env.example config/secrets.env   # 값 채우기
#   META_ACCESS_TOKEN / META_AD_ACCOUNT_ID
#   NAVER_SA_API_KEY / NAVER_SA_SECRET_KEY / NAVER_SA_CUSTOMER_ID
#   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (경쟁사)

python scripts/run_all.py --mode live --date 2026-06-17
```


## 지표 수정 (수정 자유도)

대시보드의 모든 지표(카드/표/차트)는 [`config/metrics.yaml`](config/metrics.yaml)에 선언돼 있다.
이 파일만 바꾸면 **코드 수정 없이** 지표를 추가/삭제/순서변경/이름변경할 수 있다.

## 구조

```
dbrick-ads-status/
├── config/        sources.yaml(shop=none) · metrics.yaml · secrets.env(.example)
├── cafe24_ops/    config · models · store · pipeline
│   ├── collectors/ ads · creative · competitor  (cafe24 는 shop=none 이라 자동 스킵)
│   └── etl/        normalize · aggregate
├── api/           FastAPI (대시보드용 읽기 API)
├── scripts/       run_all.py (데일리 진입점)
├── tests/         설정 · 파이프라인 스모크 테스트
└── dashboard/     React 대시보드 (카페24 탭 제외, 3탭)
```

## 남은 일 (사용자가 직접 연결)

- [ ] `DATABASE_URL`(Neon) — GitHub Secrets
- [ ] `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (+선택 `META_APP_ID/SECRET`)
- [ ] `NAVER_SA_API_KEY/SECRET_KEY/CUSTOMER_ID`
- [ ] `NAVER_CLIENT_ID/SECRET` + `config/sources.yaml`의 `competitors` 실제 확정
- [ ] Render Blueprint 배포
- [ ] (후순위) Google Ads / Kakao Moment

순서/발급 방법은 [`DBRICK-CONNECT-GUIDE.md`](DBRICK-CONNECT-GUIDE.md) 참고.
