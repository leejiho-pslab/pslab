---
name: 온라인-광고
description: 온라인 광고 성과 대시보드(광고 채널 성과·ROAS·CTR·CPC + 소재별 이미지·성과 '광고 히스토리' + 경쟁사 모니터링)를 신규 업체에 배포/연동하거나 점검/수정할 때 사용. Meta·네이버SA·구글·카카오 광고 API와 네이버 DataLab/검색(경쟁사)을 다룬다(매출/방문자 운영지표는 '카페24-운영현황' 스킬). "광고만 세팅", "소재 성과/이미지", "ROAS 대시보드", "경쟁사 모니터링", "광고 히스토리" 같은 요청에 사용.
---

# 온라인 광고 (광고 · 광고 히스토리 · 경쟁사 도메인)

광고 성과를 매일 무인 수집해 대시보드 **"광고" / "광고 히스토리" / "경쟁사 모니터링" 3개 탭**으로
보여주는 무료 자동화 도메인. 매출·방문 운영지표는 별도 스킬(**카페24-운영현황**)이라,
광고만 원하는 업체는 이 스킬만으로 세팅·운영한다.
프로젝트 루트: [`cafe24-ops-status/`](../../../cafe24-ops-status/).

## 이 도메인이 다루는 것 (3개 탭)

- **광고**: 채널별(Meta·네이버SA·구글·카카오) 광고비·광고매출·ROAS·CTR·CPC·CVR, 선택기간 vs 비교기간 증감, 채널 추이.
- **광고 히스토리**: 소재(ad)별 **이미지 카드 + 성과**(구매·ROAS·구매전환값·CTR·CPC·비용), 기간 필터·정렬, 피로도(성과 하락) 신호.
- **경쟁사 모니터링**: 네이버 DataLab 검색어 트렌드 + 쇼핑 검색, 경쟁사 프로모션/베스트 변화.

**데이터 소스**: Meta Marketing API(계정+ad-level+소재 썸네일) · 네이버 검색광고 API · (선택)구글/카카오 · 네이버 DataLab/검색 API(경쟁사).

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

## 레퍼런스 (이 도메인)

**API**: `/api/ads/summary` · `ads/channels` · `ads/overview(cmp_from,cmp_to 필수)` · `ads/channel-trend` · `ads/trend` · `creatives/overview` · `creatives/fatigue` · `creatives/trend` · `competitors` · `competitors/trend` · `competitors/naver` · `competitors/creatives` · `competitors/best-changes`.
**핵심 파일**: `collectors/{ads,creative,competitor}.py` · `clients/{ads_meta,ads_naver,ads_google,ads_kakao,naver_datalab,naver_search}.py` · `etl/{ads_metrics,creative_metrics,competitor_metrics}.py` · `pages/{AdsPage,CreativePage,CompetitorPage}.tsx` + 컴포넌트(PeriodSelector·AdsTrendChart·AdCostChart·CreativeThumb).
**로컬**: `python scripts/run_all.py --mode live --days 30` · `uvicorn api.main:app --reload` · `cd dashboard && npm run build` · `pytest`.
