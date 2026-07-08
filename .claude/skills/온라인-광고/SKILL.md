---
name: 온라인-광고
description: 온라인 광고 성과 대시보드(광고 채널 성과·ROAS·CTR·CPC + 소재/키워드 '광고 히스토리' + 경쟁사 모니터링 + 월간 리포트)를 신규 업체에 배포/연동하거나 점검/수정할 때 사용. Meta·네이버SA(파워링크/플레이스 분리)·구글·카카오 광고 API와 네이버 DataLab/검색(경쟁사)을 다룬다(매출/방문자 운영지표는 '카페24-운영현황' 스킬). "광고만 세팅", "소재/키워드 성과", "ROAS 대시보드", "경쟁사 모니터링", "광고 히스토리", "월간 리포트/브리핑" 같은 요청에 사용.
---

# 온라인 광고 (광고 · 광고 히스토리 · 경쟁사 · 월간 리포트 도메인)

광고 성과를 매일 무인 수집해 대시보드 **"광고" / "광고 히스토리" / "경쟁사 모니터링" / "월간 리포트" 4개 탭**으로
보여주는 무료 자동화 도메인. 매출·방문 운영지표는 별도 스킬(**카페24-운영현황**)이라,
광고만 원하는 업체는 이 스킬만으로 세팅·운영한다.
프로젝트 루트: [`cafe24-ops-status/`](../../../cafe24-ops-status/).

> **참고(다른 업체 복제본)**: 자사몰 없는 리드젠(상담·문의형) 업체는 같은 골격을 `dbrick-ads-status/`처럼
> 복제해 쓰되, '전환'을 구매가 아니라 Meta '결과'(등록완료/리드/문의)로 집계하고 매출/ROAS 대신
> CPA/CVR 중심으로 지표를 재구성한다. keek 은 자사몰 실매출이 있는 이커머스라 **매출·ROAS 중심**을 유지한다.

## 이 도메인이 다루는 것 (4개 탭)

- **광고**: 채널별(Meta·**네이버 파워링크/플레이스**·구글·카카오) 광고비·광고매출·ROAS·CTR·CPC·CVR, 선택기간 vs 비교기간 증감, 채널 추이.
- **광고 히스토리**: 채널 탭 — **Meta 소재**(이미지 카드 + 구매·ROAS·CTR·CPC·비용, 피로도(성과 하락) 신호) /
  **네이버 검색(키워드)** 리포트(광고비 소진 기준 정렬, 캠페인·광고그룹·노출·클릭·CTR·CPC·전환) / **네이버 플레이스**.
- **경쟁사 모니터링**: 네이버 DataLab 검색어 트렌드 + 쇼핑 검색, 경쟁사 프로모션/베스트 변화.
- **월간 리포트**: 매출/광고 컨설턴트 관점 **월간 브리핑**(전월 vs 전전월) — 한줄요약·KPI 증감표(매출·광고비·광고매출·ROAS·주문·객단가·전환율·방문자)·
  좋아진/아쉬운·매체별 비교+해석·네이버 키워드 TOP·다음달 전략 초안. **매월 1일 자동 생성**(전월 확정분)해 탭에서 확인,
  **Word(.docx) 다운로드**로 편집 가능. 신규 수집 없이 기존 `facts`(ads/creative/naver_keyword)+`kpi_daily`를 월 단위로 집계해 생성.

**데이터 소스**: Meta Marketing API(계정+ad-level+소재 썸네일) · 네이버 검색광고 API(계정/캠페인/광고그룹/키워드 stats) · (선택)구글/카카오 · 네이버 DataLab/검색 API(경쟁사).

## 무료 스택 (모든 도메인 공통)

| 역할 | 플랫폼 | 비고 |
|---|---|---|
| 매일 수집 | GitHub Actions | `cafe24-daily-collect.yml` (07:00 KST, 전 채널) |
| 데이터 영속 | Neon Postgres | `DATABASE_URL` |
| 웹/API | Render Web Service | 무료(15분 무접속 슬립 → keepalive로 방지) |

수집 → 정규화 → Neon(`facts`) → FastAPI → React. 소재/경쟁사는 KPI 합산이 아니라 `facts`를 직접 집계해 서빙.

## 신규 업체 온보딩 (광고만)

1. **저장소**: repo 포크. 2. **Neon** `DATABASE_URL` Secret([`DEPLOY-FREE.md`](../../../cafe24-ops-status/DEPLOY-FREE.md) §0).
3. **광고 채널**(있는 것만 — 없으면 자동 스킵):
   - **Meta**: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (+ `META_APP_ID`/`META_APP_SECRET` 넣으면 매 실행 60일 장기토큰 자동 갱신 → 무인 지속).
   - **네이버SA**: `NAVER_SA_API_KEY`, `NAVER_SA_SECRET_KEY`, `NAVER_SA_CUSTOMER_ID`.
   - **구글/카카오**(후순위): `GOOGLE_ADS_*` / `KAKAO_ACCESS_TOKEN`,`KAKAO_AD_ACCOUNT_ID`.
4. **경쟁사**: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`(네이버 개발자센터, DataLab+검색). 경쟁사는 `config/sources.yaml`의 `competitors[]`에 정의.
5. **Render**: Blueprint → `render.yaml` → `DATABASE_URL`(+광고/네이버 키) → Deploy.
6. **백필**: Actions `ops daily collect` 수동 실행(`days: 30`). (소재/경쟁사는 스냅샷 성격 — 과거 백필 제한, `--skip`로 조정)
7. **검증**: `keek-api-smoke.yml`(엔드포인트 200), `cafe24-diag.yml`(연결 진단).
8. **월간 리포트**: 별도 세팅 불필요(수집된 `facts`/`kpi_daily`만으로 온디맨드 생성). API `/api/report/monthly`는 `month` 미지정 시
   **`latest_complete_month`(KST 오늘의 전월)**를 기본값으로 → **매월 1일이 되면 탭이 자동으로 전월 리포트를 표시**(스케줄 업로드 불필요).
   `python-docx` 의존성이 `requirements.txt`에 필요(Word 다운로드).

> 광고만 쓰면 카페24/GA4 수집기는 자격증명 없어 자동 스킵된다. "카페24 어드민" 탭까지 숨기려면
> `dashboard/src/App.tsx`의 `TABS`에서 `cafe24` 탭 제거(선택).

### 업체별 필수 교체
`config/sources.yaml`(`ads[].account_id`, `competitors[]`=업체 경쟁사) · `render.yaml`(`services[].name`) · keepalive/smoke 워크플로의 하드코딩 `keek-ops-dashboard.onrender.com` · GitHub Secrets.

## 핵심 함정/교훈 (이 도메인)

- **소재 이미지가 안 뜸** → 소재는 `ad-level insights`(성과) + `/act_{id}/ads?fields=creative{thumbnail_url,image_url}`(썸네일)를 `source='creative'` facts로 저장. **활성/최근활성 광고만** 반환됨(중단 소재는 빠짐).
- **`/api/ads/overview` 422** → `cmp_from`/`cmp_to`가 **필수**. 프론트 `computeRanges`가 선택·비교 4개 값을 항상 채움(비우면 광고 탭 전체 ErrorState).
- **소재/경쟁사 재수집 시 낡은 행 잔존** → 썸네일/카테고리명 바뀌면 dims 달라짐. 재삽입 전 `delete_facts(date, source)`로 소스별 교체.
- **Meta 토큰 만료로 수집 중단** → `META_APP_ID/SECRET`로 실행당 1회 장기토큰 교환 후 DB(app_kv) 영속. DB 토큰이 env Secret보다 우선.
- **경쟁사 버즈 오탐** → 네이버 검색 결과는 정확매칭 필터로 브랜드명 오탐 제거(`competitor_metrics`).
- **네이버SA ROAS** → 계정 통화/전환 기준 확인 완료(정상). 채널별 `_derive`로 ROAS/CTR/CPC/CVR 파생.
- **라이브 "서버 오류"** → Render 슬립(keepalive) 또는 브라우저 캐시(`Ctrl+Shift+R`). 서버 진단은 `keek-api-smoke.yml`(GitHub 러너).
- **월간 리포트 지표 선택** → keek 은 자사몰 실매출이 있어 매출·ROAS 를 KPI 표/매체별 표의 중심으로 삼는다(CPA/리드젠 지표 아님).
  리드젠 복제본(`dbrick-ads-status/`)은 반대로 매출/ROAS 를 다루지 않고 결과(문의)·CPA 중심 — 업체 성격에 맞는 지표 세트를 유지할 것.

## 레퍼런스 (이 도메인)

**API**: `/api/ads/summary` · `ads/channels` · `ads/overview(cmp_from,cmp_to 필수)` · `ads/channel-trend` · `ads/trend` · `ads/keywords(channel,sort=ad_cost)` · `creatives/overview` · `creatives/fatigue` · `creatives/trend` · `competitors` · `competitors/trend` · `competitors/naver` · `competitors/creatives` · `competitors/best-changes` · `report/monthly(month? 기본 latest_complete_month)` · `report/monthly.docx`(Word 스트리밍).
**핵심 파일**: `collectors/{ads,creative,naver_keyword,competitor}.py` · `clients/{ads_meta,ads_naver,ads_google,ads_kakao,naver_datalab,naver_search}.py` · `etl/{ads_metrics,creative_metrics,keyword_metrics,competitor_metrics,monthly_report}.py` · `report_docx.py`(python-docx) · `pages/{AdsPage,CreativePage,CompetitorPage,MonthlyReportPage}.tsx` + 컴포넌트(PeriodSelector·AdsTrendChart·AdCostChart·CreativeThumb).
**로컬**: `python scripts/run_all.py --mode live --days 30` · `uvicorn api.main:app --reload` · `cd dashboard && npm run build` · `pytest`.
