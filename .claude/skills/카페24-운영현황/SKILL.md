---
name: 카페24-운영현황
description: 카페24 자사몰을 쓰는 업체에 무료 자동화 운영현황 대시보드(매출·광고·소재·경쟁사·방문자)를 신규 배포/연동하거나, 기존 파이프라인의 수집·집계·배포·토큰·오류를 점검/수정할 때 사용. "다른 업체에 적용", "대시보드 오류", "데이터가 안 채워짐", "광고비/방문자 비어있음" 같은 요청에 사용.
---

# 카페24 운영현황

카페24 자사몰의 **매출·주문 + 광고(Meta·네이버SA) + 소재(이미지+성과) + 경쟁사 + GA4 방문자**를
매일 무인 수집해 하나의 React 대시보드(4탭)로 보여주는 **완전 무료** 자동화 파이프라인.
프로젝트 루트: [`cafe24-ops-status/`](../../../cafe24-ops-status/).

## 무료 스택 (카드 등록 없이 가능)

| 역할 | 플랫폼 | 비고 |
|---|---|---|
| 매일 수집 | **GitHub Actions** | cron `0 23 * * *` = 08:00 KST |
| 데이터 영속 | **Neon Postgres** | 무료, `DATABASE_URL` |
| 웹/API | **Render Web Service** | 무료 (15분 무접속 시 슬립 → keepalive로 방지) |
| 알림(선택) | Slack Webhook | 현재 **홀딩** |

수집 → 정규화 → 집계(`kpi_daily`) → Neon 저장 → FastAPI → React(4탭: 카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사).
지표는 전부 [`config/metrics.yaml`](../../../cafe24-ops-status/config/metrics.yaml) 선언식 — **코드 수정 없이** 카드/표/차트 변경 가능.

## 🆕 다른 업체에 적용 (온보딩 런북)

전부 **설정+시크릿 구동**이라, 새 업체 = 이 저장소 포크 1개 + 그 업체 시크릿. 순서대로:

1. **저장소 준비**: 이 repo를 업체별로 포크(또는 별도 repo). GitHub Secrets는 repo 단위라 업체=repo 1개가 가장 단순.
2. **업체 고유값 교체** (아래 "업체별 필수 교체" 표 참고 — 안 바꾸면 옆 업체 데이터/URL로 오염).
3. **Neon**: `neon.tech` 가입 → 프로젝트 생성 → connection string → GitHub Secret `DATABASE_URL`. (상세: [`DEPLOY-FREE.md`](../../../cafe24-ops-status/DEPLOY-FREE.md) §0)
4. **카페24 토큰**: `scripts/cafe24_auth.py --authorize` → 승인 → `--code <코드>`. Secrets: `CAFE24_MALL_ID`/`CLIENT_ID`/`CLIENT_SECRET`/`ACCESS_TOKEN`/`REFRESH_TOKEN`. 이후 DB가 회전 토큰 영속 → 무인 지속. (상세: [`CONNECT-GUIDE.md`](../../../cafe24-ops-status/CONNECT-GUIDE.md), [`TOKEN-LOCATIONS.md`](../../../cafe24-ops-status/TOKEN-LOCATIONS.md))
5. **광고/경쟁사/GA4** (있는 것만, 없으면 자동 스킵): Meta(`META_ACCESS_TOKEN`,`META_AD_ACCOUNT_ID`, 선택 `META_APP_ID/SECRET`로 60일 토큰 자동갱신) · 네이버SA(`NAVER_SA_*`) · 경쟁사(`NAVER_CLIENT_ID/SECRET`) · GA4(`GA4_PROPERTY_ID`,`GOOGLE_APPLICATION_CREDENTIALS_JSON`, [`GA4-SETUP.md`](../../../cafe24-ops-status/GA4-SETUP.md)).
6. **Render 배포**: New → Blueprint → repo 연결 → 기본 브랜치 → `render.yaml` 인식 → 최소 `DATABASE_URL`(+키들) 입력 → Deploy → `https://<이름>.onrender.com`. (같은 `DATABASE_URL`을 쓰면 Actions 수집분이 그대로 화면에 뜸)
7. **백필**: Actions에서 `ops daily collect` 수동 실행(`days: 14~30`) 또는 `cafe24-backfill.yml`. GA4 과거치는 backfill 커서로 장기 백필.
8. **검증**: `keek-api-smoke.yml` 수동 실행 → 20개 엔드포인트 전부 200 확인. `cafe24-verify.yml`로 데이터 정확도 리포트.

### 업체별 필수 교체 (⚠️ 안 바꾸면 오염/오류)

| 위치 | 무엇을 | 왜 |
|---|---|---|
| `config/sources.yaml` | `shop.mall_id`, `brand`, `ads[].account_id`, `competitors[]` | 업체 자사몰/광고계정/경쟁사 |
| `config/metrics.yaml` | `daily_table` 카테고리 그룹(업체 카테고리명) | 카테고리 매출 매핑 |
| `render.yaml` | `services[].name` (기본 `keek-ops-dashboard`) | onrender URL이 됨 — 업체마다 달라야 함 |
| `.github/workflows/keek-dashboard-keepalive.yml`, `keek-api-smoke.yml` | 하드코딩된 `keek-ops-dashboard.onrender.com` | 위 Render 이름과 일치시켜야 keepalive/스모크가 맞는 서버를 침 |
| GitHub Secrets 전체 | 그 업체 자격증명 | repo 단위 |

## 운영 (무인 데일리)

- **수집**: `cafe24-daily-collect.yml` (08:00 KST). 한 소스 실패해도 나머지 계속(견고화).
- **콜드스타트 방지**: `keek-dashboard-keepalive.yml` 10분마다 `/health` 핑 → 슬립 방지. **무료서버 "서버 오류"의 주원인이 슬립이므로 필수.**
- **토큰 회전**: DB(app_kv) 저장 토큰이 env Secret보다 **우선**. 토큰 꼬이면 `cafe24-token-reset.yml`로 DB 클리어 후 Secret 재주입 → `cafe24-token-bootstrap.yml`. (상세: [`SECURITY-ROTATION.md`](../../../cafe24-ops-status/SECURITY-ROTATION.md))
- **점검**: `keek-api-smoke.yml`(엔드포인트 200), `cafe24-verify.yml`(정확도), `cafe24-diag.yml`/`cafe24-ga4-diag.yml`(연결 진단).

## 로컬 개발/검증

```bash
cd cafe24-ops-status && pip install -r requirements.txt
python scripts/run_all.py                 # 어제·mock 1회
python scripts/run_all.py --days 21 --mode live   # 실수집 백필
uvicorn api.main:app --reload             # API + 대시보드 서빙
cd dashboard && npm install && npm run build   # 프론트 빌드(배포 전 필수 통과)
pytest                                    # 전체 통과(현재 74)
```

## 핵심 함정/교훈 (반복 실수 방지)

- **광고비/광고매출/매출대비비율이 항상 "—"** → `aggregate_daily`가 `ads` 소스(채널별 dims)를 `kpi_daily`에 합산해야 함. cafe24 소스만 보면 영원히 빔. (`etl/aggregate.py`)
- **카테고리 100% "기타"** → `/categories/{no}/products`는 422. **`/admin/products?category={N}`** 사용. `full_category_name`은 dict라 최심(가장 구체) depth 추출.
- **재수집 시 합계 2배** → 차원(dims) 바뀐 낡은 행이 남음. 재삽입 전 `delete_facts(date, source)`로 소스별 교체.
- **방문자/전환율 빔** → GA4 우선(`GA4_PROPERTY_ID`+SA JSON). GCP에서 **"Google Analytics Data API" 사용설정** + SA를 GA4 속성 뷰어로 추가 필수.
- **`/api/ads/overview` 422** → `cmp_from`/`cmp_to` 필수 파라미터. 프론트 `computeRanges`가 4개 값 항상 채움(비우면 광고탭 전체가 ErrorState).
- **라이브 대시보드 "오류"** → 대부분 (a) Render 슬립(keepalive로 해결) 또는 (b) 브라우저 캐시(강력새로고침 `Ctrl+Shift+R`). 서버 진단은 `keek-api-smoke.yml`로 GitHub 러너에서 직접(에이전트 샌드박스는 onrender egress 403 차단).
- **Meta 소재 이미지** → `ad-level insights`(성과) + `/act_/ads?fields=creative{thumbnail_url,image_url}`(썸네일)를 `source='creative'` facts로. 활성/최근활성 광고만 반환됨.

## 레퍼런스

**주요 API** (React가 호출, 전부 `/api/…`):
`config/metrics · dates · summary · period-comparison · digest · daily · daily-detail · trend`
`ads/summary · ads/channels · ads/trend · ads/overview(cmp_from,cmp_to 필수) · ads/channel-trend`
`creatives/overview · creatives/fatigue · competitors · competitors/trend · competitors/best-changes`

**핵심 파일**: `pipeline.py`(오케스트레이션) · `store.py`(Neon/SQLite, facts+kpi_daily+app_kv) · `collectors/{cafe24,ads,creative,competitor}.py` · `clients/{cafe24_client,ads_meta,ads_naver,ga4}.py` · `etl/{aggregate,compare,breakdown,ads_metrics,creative_metrics}.py` · `api/main.py` · `dashboard/src/`.

**문서**: `DEPLOY-FREE.md`(배포 순서) · `CONNECT-GUIDE.md`(연동) · `GA4-SETUP.md` · `GITHUB-ACTIONS.md` · `SECURITY-ROTATION.md` · `SMOKE.md` · `TOKEN-LOCATIONS.md`.
