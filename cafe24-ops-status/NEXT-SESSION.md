# 다음 세션 인수인계 (keek 운영/광고 대시보드)

> ⚠️ **반드시 이 저장소에서 새 세션을 시작할 것: `leejiho-pslab/pslab`**
> (❌ `moomoo` 등 다른 저장소 아님 — 그러면 이 파일이 안 보인다)
> 브랜치: 기본 **`claude/eager-lamport-mX0eT`** (또는 `claude/sweet-knuth-fypjml`) — 둘 다 이 파일 있음.
> 새 대화 킥오프 한 줄:
> **"leejiho-pslab/pslab 저장소에서 cafe24-ops-status/NEXT-SESSION.md 읽고 이어서 진행해줘"**

## 1. 프로젝트 한눈에

카페24 자사몰(**coversomeone1**, 브랜드 **keek**)의 매출·광고·소재·경쟁사·방문자를
매일 무인 수집해 React 대시보드로 보여주는 **완전 무료** 자동화 시스템.

- **라이브 대시보드**: https://keek-ops-dashboard.onrender.com
- **저장소**: `leejiho-pslab/pslab`, 프로젝트 폴더 `cafe24-ops-status/`
- **무료 스택**: GitHub Actions(수집) · Neon Postgres(`DATABASE_URL`) · Render Web(웹/API)
- **파이프라인**: 수집 → 정규화 → 집계(`kpi_daily`) → Neon(`facts`) → FastAPI(`api/main.py`) → React(`dashboard/`)
- **대시보드 4탭**: 카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링

## 2. 브랜치 / 배포 (중요)

- **기본 브랜치 = `claude/eager-lamport-mX0eT`** — 스케줄 워크플로·Render 배포가 여기서 돈다.
  `pslab-bot` 자동봇이 여기 자주 커밋하므로, 푸시 전 항상 `git fetch` 후 rebase/재시도.
- 작업 브랜치 `claude/sweet-knuth-fypjml`에 커밋 후 **eager-lamport로 cherry-pick**해야 실제 반영.
- Render는 eager-lamport push마다 **autoDeploy**. 프론트 배포 확인 = `keek-api-smoke.yml` 로그의 번들 해시가 로컬 `npm run build` 해시와 일치하는지.
- 에이전트 샌드박스는 onrender/Neon egress가 막혀 **라이브를 직접 못 친다** → GitHub Actions 워크플로로 확인.

## 3. 스킬 (업체별 재적용)

도메인별로 분리돼 있어 신규 업체에 각각 독립 세팅 가능:
- **`/카페24-운영현황`** — 카페24 어드민 탭(매출·주문·방문자·카테고리·CRM·브리핑). 소스: 카페24 Admin API + GA4.
- **`/온라인-광고`** — 광고+광고히스토리+경쟁사 탭(ROAS·CTR·CPC·소재이미지·경쟁사). 소스: Meta/네이버SA/구글/카카오 + 네이버 DataLab/검색.
- 파일: `.claude/skills/카페24-운영현황/SKILL.md`, `.claude/skills/온라인-광고/SKILL.md`

## 4. 이번까지 완료된 작업

- 데이터 정확도 검수, 카테고리 매핑 수정(`/admin/products?category=N`), 후기/품절 수집
- **GA4 연동**(방문자·전환율 + 신규/재방문 `newVsReturning`) — 2025-01-01부터 백필됨
- **Meta 소재 이미지+성과**(광고 히스토리 탭, ad-level insights + 썸네일)
- **광고비 KPI 누락 버그 수정**(`aggregate_daily`가 ads 소스 합산 → 광고매출/매출대비비율 채워짐)
- **요약 카드 = 선택 기간 합계**(기간비교표와 일치, `/api/summary?from=&to=`)
- **"어제" 기간** 전 탭 추가 + **타임존 버그 수정**(`daysBefore` UTC화) + **"어제"=조회일 당일**로 정의
- **방문자 상세 카드**(신규/재방문/재방문율/회원가입율) + **방문자 추이 그래프**(2026-06부터)
- **오늘의 브리핑 전문 분석 코멘트**(전일/전주/전년, 평균 급등락, 이상치, 광고 분리)
- **콜드스타트 방지** `keek-dashboard-keepalive.yml`(10분 핑), **스모크** `keek-api-smoke.yml`
- 스킬 2종 분리(운영현황/온라인광고)
- **일일 자동 수집 스케줄 08:00→07:00 KST 수정** + **`yesterday()` UTC→KST 타임존 버그 수정**(매일 하루씩 밀려 수집되던 문제, 백필로 복구)
- **네이버SA 파워링크/플레이스 자동 분리**(`ads_naver.py` — `campaignTp` 기준 `naver_powerlink`/`naver_place`/`naver_other` 채널 분리 집계, 추가 자격증명 불필요).
- **네이버 키워드 리포트**(광고 히스토리 탭에 Meta 소재/네이버 검색(키워드)/네이버 플레이스 상단 채널탭 추가). 캠페인→광고그룹→키워드 계층을 따라가(`list_adgroups`/`list_keywords`/`fetch_keyword_facts`) 키워드별 노출/클릭/광고비/전환을 `source="keyword"` facts로 저장, `/api/ads/keywords`가 키워드 리포트 테이블(키워드/캠페인/광고비 소진/노출/클릭/CTR/CPC/전환, 정렬 가능)을 제공.
  - `NaverSearchAdClient._match_rows_to_ids`가 `/stats` 응답 행을 요청 id에 매칭한다.
  - **라이브 진단 히스토리(2026-07-06)**: 첫 수집에서 "id 수(100)와 응답 행 수(0)가 달라 매칭 불가" 경고가 대량(30회) 발생 → 처음엔 호출 속도 제한으로 추정해 0.5초 스로틀(`request_interval`, `from_account()`에서만 활성화, 테스트엔 영향 없음)을 추가했으나 재검증해도 동일 → 청크 크기(100→20)를 줄여도 여전히 다수 청크가 0행 → **최종 원인 확인**: 응답 행에는 실제로 `id`/`nccKeywordId` 필드가 붙어 오고(그래서 id 매칭은 항상 정상 동작), **그 날짜에 노출/클릭이 전혀 없던 키워드는 응답 배치에서 행 자체가 빠지는 것이 정상 동작**(광고 플랫폼 stats API의 흔한 패턴) — 배치 크기나 호출 속도와 무관. `_match_rows_to_ids`가 빈 응답(rows=[])을 "매칭 실패"로 취급해 경고를 남기던 게 오탐이었음. **수정 완료**: 빈 응답은 경고 없이 조용히 스킵하도록 변경, 청크 크기는 100으로 원복(스로틀은 유지 — 해가 없고 안전망 역할). 실제로 두 라이브 실행 모두 키워드 260건(65개 키워드에 그날 실제 활동)으로 일치해 정확히 수집되고 있었음이 확인됨.
  - 스로틀(`request_interval`)은 실제 원인은 아니었지만 순차 호출이 많은 이 리포트의 안전장치로 유지.
- 이걸로 `온라인-광고` 스킬에 문서화된 dbrick 프로젝트 신규 기능 중 2개(네이버 파워링크/플레이스 분리 + 네이버 키워드 리포트) 반영 완료 — GA4 전환·사이트분석/경쟁사 딥링크·인스타 임베드/지역현황은 **아직 미반영**(사용자 결정·신규 자격증명 필요해 보류).
- **무인 수집 안정성 강화(2026-07-06)** — 5가지 취약점을 진단·수정:
  1. **광고 수집기 채널 간 장애 격리**(`collectors/ads.py`): 한 채널(예: Meta) 오류가 그날 4개 채널 전체 데이터를 날리던 구조 → 채널별 try/except 로 격리, 실패 채널은 `partial_errors` 에 기록.
  2. **네이버SA 일시 오류 재시도**(`ads_naver.py` `_get`): 429/5xx/네트워크 순단은 최대 3회 재시도(백오프는 `request_interval`×시도수 — 테스트는 0초). 4xx(429 제외)는 즉시 실패. 키워드 리포트의 수십 회 순차 호출을 blip 1회로부터 보호.
  3. **키워드 stats 청크/계층 격리**: 청크·캠페인·광고그룹 단위 실패는 건너뛰고 나머지 수집(부분 > 전무). 단 전 청크 실패 시엔 예외로 올려 기존 데이터가 빈 결과로 덮이지 않게 함.
  4. **부분 실패 가시성 + 데이터 보존**(`pipeline.py`, `collectors/base.py`): 수집기의 `partial_errors` 를 `result.errors["소스/채널"]` 로 승격 → `collection_health_alert`(일일 브리핑 경고)에 잡힘. 부분 실패 소스는 delete+reinsert 대신 **upsert만** 수행해 재수집 시 실패 채널의 기존 정상 데이터를 보존(낡은 차원 정리는 다음 전체 성공 수집에서).
  5. **07:00 무인 수집 3회 재시도**(`cafe24-daily-collect.yml`): 일시 실패 시 90초 간격 재시도. 파이프라인이 소스 단위 멱등이라 안전.
  6. **스케줄 수집 = 최근 3일 재수집**(dbrick 프로젝트와 동일 패턴 채택): 하루 실행이 빠져도 다음날 자동 자가치유 + GA4 전환·Meta 광고비의 24~48h 지연 보정 반영. **경쟁사는 현재 스냅샷 소스라 3일 재수집에서 제외**(`--skip competitor`)하고 어제 하루만 별도 수집 — 과거 날짜에 오늘 스냅샷이 덮여 이력이 오염되는 것 방지. 수동 실행(days 입력)은 기존 동작 유지.
- 테스트 109개 통과

## 5. 남은 일 / 알려진 갭

- **신규가입수·회원가입율 — ⛔ 미연동 확정(조사 종결, 사용자 확인 완료)**: 4가지 경로를 전부 라이브로 확인했고 모두 불가.
  1. **카페24 Admin API** `/customers`, `/customers/count` — 구조적으로 불가.
     `count: 404 for /api/v2/admin/customers/count :: {"error":{"code":404,"message":"No API found."}}`
     `list: 422 for /api/v2/admin/customers :: {"error":{"code":422,"message":"Please enter the cellphone or member_id parameter."}}`
     → count 엔드포인트 자체가 없고, list는 `member_id`/`cellphone` 필수라 기간별 대량조회 미지원. 파라미터 수정으로 해결 불가.
  2. **GA4** — `cafe24-ga4-diag.yml`로 최근 8일 이벤트 12종 전수 확인(`page_view, session_start, 클릭, first_visit, 제품분류_클릭, buy_now_버튼_클릭, user_engagement, 장바구니_보기, 구매하기_버튼_클릭, 장바구니_버튼_클릭, 결제완료, 관심상품_버튼_클릭`) → 회원가입 이벤트 없음. (스토어프론트에 가입완료 시 커스텀 이벤트를 새로 심으면 가능하지만 이 프로젝트 범위 밖 — 보류)
  3. **카페24 Analytics API**(`cafe24data`) — 사용자가 직접 개발자센터에서 앱 생성·전체 엔드포인트 카탈로그 확인(`Adeffect, Carts, Members sales, Pages, Products, Sales, Visitors, Visitpaths` 등 22개) → 가입/등록 관련 엔드포인트 전무("Members sales"는 회원/비회원 매출 구분이지 가입수 아님). 게다가 공식 문서상 "카페24의 **승인을 받은 제휴사**에만 제공"이라 일반 쇼핑몰 계정으로는 애초에 대상이 아님.
  4. **카페24 관리자 "통계 > 고객분석 > 요일별/시간별 분석"** — 관리자 화면에는 "신규가입자" 컬럼이 존재(사용자가 직접 캡처 확인)하지만, 이건 내부 리포팅 시스템이며 공개 Admin API로 노출되지 않음(있었다면 애초에 1번 문제가 없었을 것).
  → **latch 버그 수정(422/401 구조적 분류 포함)은 유지**하되, `count_new_customers` 자체를 더 고치려 시도하지 않기로 사용자와 합의. 대시보드에는 다른 미연동 지표(순매출·환불 등)와 동일하게 **`PlannedGroups.tsx`의 STATUS를 `missing`으로 표시**해 정직하게 노출 중(핵심 지표 표/신규가입 흐름 차트는 UI만 유지, 값은 항상 "—").
  → 재추진하려면: (a) 스토어프론트에 GA4 `sign_up` 커스텀 이벤트 추가(프론트엔드 별도 작업) 또는 (b) 카페24에 Analytics API 제휴사 신청 절차 문의, 둘 중 하나가 필요.
  - 진단 인프라는 준비됨: `log.warning("신규가입수 수집 실패(...): ...")`가 latch 여부와 무관하게 매번 실제 HTTP 상태/사유(count+list 조합)를 노출(`cafe24-daily-collect.yml` 로그). `cafe24-verify.yml`(mode=db)도 커버리지/최근값 리포트. `scripts/ga4_diag.py`는 이벤트명별 건수까지 진단.
- **⛔ 미연동 지표**(정직하게 표시 중): 순매출·취소/환불(환불 API), 문자·알림톡·카카오 발송(발송 솔루션), 장바구니·재고·입고·외부채널(카페24 재고/장바구니 API). 필요 API 붙이면 채워짐.
- **도메인 완전 분리 배포**(선택): 지금은 미연동 소스 자동 스킵으로 한 대시보드에 공존. 업체별 별도 URL 원하면 `App.tsx`의 `TABS` 축소 + `render.yaml` 서비스명 분리 필요.
- Slack 알림: 사용자 요청으로 **홀딩 중**.

## 6. 운영/검증 워크플로 (GitHub Actions, 수동 실행 가능)

- `cafe24-daily-collect.yml` — 매일 07:00 KST 전 채널 수집(수동 `days:N` 백필). **기본 브랜치에서 실행.**
- `keek-api-smoke.yml` — 라이브 20+ 엔드포인트 200 점검 + 배포 번들 해시 출력.
- `keek-dashboard-keepalive.yml` — 10분마다 `/health` 핑(슬립 방지).
- `cafe24-verify.yml` — 데이터 정확도 리포트. `cafe24-ga4-diag.yml` — GA4 진단.
- 토큰 꼬임: `cafe24-token-reset.yml`(DB 클리어) → `cafe24-token-bootstrap.yml`.

## 7. 반복 실수 방지 (핵심 함정)

- 재수집 시 낡은 dims 잔존 → 재삽입 전 `delete_facts(date, source)`.
- `/api/ads/overview`는 `cmp_from`/`cmp_to` 필수(없으면 광고탭 ErrorState).
- `daysBefore`는 **UTC 파싱/포맷**(로컬 KST면 하루 밀림).
- Meta 토큰은 `META_APP_ID/SECRET`로 60일 자동 갱신 → DB(app_kv) 토큰이 env보다 우선.
- 라이브 "오류" = 대개 Render 슬립(keepalive) or 브라우저 캐시(`Ctrl+Shift+R`).
- **비밀값은 절대 커밋 금지** — 전부 GitHub Secrets.

## 8. 로컬 개발 빠른 시작

```bash
cd cafe24-ops-status && pip install -r requirements.txt
python scripts/run_all.py --days 21            # mock 21일 적재(store/ = gitignore)
uvicorn api.main:app --reload                  # API :8000
cd dashboard && npm install && npm run build   # 배포 전 필수 통과
pytest                                         # 79 통과
```
