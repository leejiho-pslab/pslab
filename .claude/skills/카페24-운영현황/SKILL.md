---
name: 카페24-운영현황
description: 카페24 자사몰의 '운영현황'(매출·주문·객단가·구매전환율·방문자·디바이스·카테고리·베스트·CRM·일일 브리핑) 대시보드를 신규 업체에 배포/연동하거나 점검/수정할 때 사용. 이 도메인은 카페24 어드민 API + GA4 방문자만 다룬다(광고/소재/경쟁사는 '온라인-광고' 스킬). "운영현황만 세팅", "매출 대시보드", "방문자/전환율 안 나옴", "카테고리 기타로만 나옴" 같은 요청에 사용.
---

# 카페24 운영현황 (카페24 어드민 도메인)

카페24 자사몰의 **판매·방문 운영지표**를 매일 무인 수집해 대시보드 **"카페24 어드민" 탭**으로
보여주는 무료 자동화 도메인. 광고·소재·경쟁사는 별도 스킬(**온라인-광고**)로 분리돼 있어,
운영현황만 원하는 업체는 이 스킬만으로 세팅·운영한다.
프로젝트 루트: [`cafe24-ops-status/`](../../../cafe24-ops-status/).

## 이 도메인이 다루는 것 (카페24 어드민 탭)

- 상단 요약 카드(선택 기간 합계) + 핵심지표 기간비교(전일/전주/전년)
- 일별 매출 추이, 신규 vs 재구매, 디바이스별 매출·주문(모바일/PC)
- 방문자 상세(전체/신규/재방문/재방문율/신규가입수/회원가입율) + **방문자 추이 그래프**
- 카테고리 매출 TOP, 베스트 상품 TOP, CRM(후기 등)
- **오늘의 브리핑**(전문 분석 코멘트: 전일·전주·전년, 평균 급등락, 이상치)

**데이터 소스**: 카페24 Admin API(주문/상품/후기/품절) + **GA4**(방문자·신규/재방문).

## 무료 스택 (모든 도메인 공통)

| 역할 | 플랫폼 | 비고 |
|---|---|---|
| 매일 수집 | GitHub Actions | `cafe24-daily-collect.yml` (08:00 KST) |
| 데이터 영속 | Neon Postgres | `DATABASE_URL` |
| 웹/API | Render Web Service | 무료(15분 무접속 슬립 → keepalive로 방지) |

수집 → 정규화 → 집계(`kpi_daily`) → Neon → FastAPI → React. 지표는 [`config/metrics.yaml`](../../../cafe24-ops-status/config/metrics.yaml) 선언식(코드 수정 없이 카드/표 변경).

## 신규 업체 온보딩 (운영현황만)

1. **저장소**: repo 포크(업체=repo 1개). 2. **Neon** `DATABASE_URL` Secret 등록([`DEPLOY-FREE.md`](../../../cafe24-ops-status/DEPLOY-FREE.md) §0).
3. **카페24 토큰**: `scripts/cafe24_auth.py --authorize` → `--code <코드>` → Secrets `CAFE24_MALL_ID`/`CLIENT_ID`/`CLIENT_SECRET`/`ACCESS_TOKEN`/`REFRESH_TOKEN`. 이후 DB가 회전 토큰 영속([`CONNECT-GUIDE.md`](../../../cafe24-ops-status/CONNECT-GUIDE.md), [`TOKEN-LOCATIONS.md`](../../../cafe24-ops-status/TOKEN-LOCATIONS.md)).
4. **GA4**(방문자·전환율 필수): `GA4_PROPERTY_ID` + `GOOGLE_APPLICATION_CREDENTIALS_JSON`. GCP에서 **"Google Analytics Data API" 사용설정** + 서비스계정을 GA4 속성 **뷰어**로 추가([`GA4-SETUP.md`](../../../cafe24-ops-status/GA4-SETUP.md)).
5. **Render**: Blueprint → `render.yaml` → `DATABASE_URL`(+cafe24/GA4 키) → Deploy.
6. **백필**: Actions `ops daily collect` 수동 실행(`days: 30`). 7. **검증**: `keek-api-smoke.yml`, `cafe24-verify.yml`(정확도 리포트).

> 광고 도메인 없이 운영현황만 쓰면 광고/소재/경쟁사 수집기는 자격증명이 없어 자동 스킵된다.
> 광고 탭까지 숨기려면 `dashboard/src/App.tsx`의 `TABS`에서 해당 탭을 제거(선택).

### 업체별 필수 교체
`config/sources.yaml`(`shop.mall_id`,`brand`) · `config/metrics.yaml`(카테고리 그룹=업체 카테고리명) · `render.yaml`(`services[].name`) · keepalive/smoke 워크플로의 하드코딩 `keek-ops-dashboard.onrender.com` · GitHub Secrets.

## 핵심 함정/교훈 (이 도메인)

- **카테고리 100% "기타"** → `/categories/{no}/products`는 422. **`/admin/products?category={N}`** 사용, `full_category_name`(dict)에서 최심 depth 추출.
- **재수집 시 합계 2배** → 차원 바뀐 낡은 행. 재삽입 전 `delete_facts(date, source)`.
- **방문자/전환율/신규·재방문 빔** → GA4 Data API 미사용설정 or SA 권한 없음. `cafe24-ga4-diag.yml`로 진단. 신규/재방문은 GA4 `newVsReturning`.
- **요약 카드가 기간비교표와 안 맞음** → 요약은 선택 기간 합계여야 함(`/api/summary?from=&to=`, `summary_cards_range`). 파생지표는 합산 후 재계산.
- **조회일과 "어제"가 안 맞음** → `daysBefore`는 UTC 파싱/포맷(로컬 KST면 하루 밀림). "어제"=조회일(base) 당일.
- **라이브 "서버 오류"** → 대개 Render 슬립(keepalive) 또는 브라우저 캐시(`Ctrl+Shift+R`). 서버 진단은 `keek-api-smoke.yml`(GitHub 러너; 샌드박스는 onrender egress 차단).

## 레퍼런스 (이 도메인)

**API**: `/api/summary(from,to)` · `period-comparison` · `daily` · `daily-detail` · `trend` · `visitor-trend` · `digest`(브리핑+코멘트) · `config/metrics` · `dates`.
**핵심 파일**: `collectors/cafe24.py` · `clients/{cafe24_client,ga4}.py` · `etl/{aggregate,compare,breakdown}.py` · `alerts.py`(브리핑/코멘트) · `pages/Cafe24Page.tsx` + 컴포넌트(SummaryCards·PeriodTable·SalesChart·DeviceDonut·DevicePerfTable·VisitorDetailCard·VisitorChart·CategoryBar·BestTable·CRMCards·BriefingBanner).
**로컬**: `python scripts/run_all.py --mode live --days 30` · `uvicorn api.main:app --reload` · `cd dashboard && npm run build` · `pytest`.
