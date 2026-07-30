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
- **대시보드 5탭**: 카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링 / 월간 리포트

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
- **월간 리포트 탭 추가(2026-07-08)** — dbrick 프로젝트(`dbrick-ads-status/`)가 먼저 구현한 "매월 1일 지난달 자동 생성 + Word 다운로드" 기능을 keek 용으로 포팅.
  dbrick 은 리드젠(구매 없는 상담·문의형) 업체라 매출/ROAS 를 안 다루고 결과(문의)·CPA 중심인데, **keek 은 자사몰 실매출이 있는 이커머스라 매출·ROAS 중심으로 지표를 재설계**(CPA 대신 ROAS/객단가/구매전환율).
  - `cafe24_ops/etl/monthly_report.py`: 두 달(전월 vs 전전월) 비교 — KPI표(매출/광고비/광고매출/ROAS/주문/객단가/구매전환율/방문자) · 매체별 비교표(+ROAS) · 좋아진/아쉬운(규칙 기반) · 해석 · 네이버 키워드 TOP6 · 다음달 전략 초안(5개). `latest_complete_month()`가 KST 오늘의 전월을 기본값으로 잡아 **매월 1일 자동으로 전월 리포트가 뜬다**(데이터 없으면 있는 가장 최근 월로 폴백).
  - `cafe24_ops/report_docx.py`: 위 데이터를 Word(.docx)로 변환(`python-docx`, `requirements.txt`에 추가). 섹션 01~05(요약표/좋아진·아쉬운/매체별표/키워드/전략초안).
  - API: `/api/report/monthly`(month 미지정 시 자동), `/api/report/monthly.docx`(다운로드) — `keek-api-smoke.yml`에도 추가.
  - 프론트: `MonthlyReportPage.tsx` 신설 + `App.tsx`에 5번째 탭("월간 리포트", 이 탭에서는 BriefingBanner 숨김) + `styles.css`에 `.mr-*` 블록(keek 의 `--blue` 액센트 사용, dbrick 원본은 브라운 계열).
  - 테스트 5종 추가(월 헬퍼, 구조, CPC 방향, 폴백, docx 바이트), 전체 114개 통과, 빌드 통과, 로컬 mock 데이터로 두 엔드포인트 실제 호출 검증 완료.
  - **다음 세션 확인 필요**: 라이브 배포 후 `keek-api-smoke.yml`로 `/api/report/monthly`·`/api/report/monthly.docx` 200 확인 + 실제 다운로드된 .docx 파일이 한글 폰트(맑은 고딕)로 깨짐 없이 열리는지 육안 확인(Render 서버에 한글 폰트가 없어도 Word 자체에 폰트명만 지정하는 방식이라 문제 없어야 하지만 미검증).
- **GA4 유입·구매 경로 탭 추가(2026-07-29)** — 사용자가 요청한 4가지(트래픽 이동경로 / 이탈 페이지 / 구매 경로 / 광고 유입 채널 변화)를 대시보드에 시각화. 2단계로 나눠 진행.
  - **1단계(수집·집계 기반)**: `clients/ga4.py` 에 파서·조회 메서드, `collectors/ga4_site.py`(`source="ga4_site"`) 신설. 한 수집기가 6개 소스로 나눠 적재 — `ga4_site`(방문자/세션/페이지뷰/체류시간/신규·재방문), `ga4_channel`(sessionSourceMedium 별 세션/사용자/전환), `ga4_page`(pageTitle 별 조회수), `ga4_landing`(landingPage 별 세션/이탈률/참여율), `ga4_entry`(landingPage×매체 세션), `ga4_funnel`(퍼널 이벤트×매체 건수).
  - **전환 정의 주의**: keek GA4 는 13개 이벤트 중 12개가 "키 이벤트"로 표시돼 있어 `keyEvents` 지표를 쓰면 전환이 크게 부풀려진다. 그래서 `eventName == 결제완료`(`GA4_CONVERSION_EVENT` 로 변경 가능) EXACT 필터로만 센다.
  - **라이브 probe 로 확인한 API 한계**(`scripts/ga4_diag.py` 의 "심화 분석 probe" 섹션에 상시 내장): `landingPage`, `bounceRate`, `engagementRate`, `eventName×sessionSourceMedium`, `sessionDefaultChannelGroup`, `sessionCampaignName` 는 **지원**. UA 의 **종료수(`exits`) 지표는 존재하지 않음**(HTTP 400 "Field exits is not a valid metric") → 이탈 페이지는 **이탈률(bounceRate)** 로 대체. 또한 개인별 **A→B→C 이동 순서**는 Data API 로 못 받는다(BigQuery export 필요) → **유입 출발점(랜딩페이지×광고채널)** + **단계별 이벤트 감소(퍼널)** 조합으로 대체.
  - **2단계(집계·API·화면)**: `etl/ga4_site.py` 에 `exit_pages`(세션 가중 이탈률 + 직전 동일 기간 대비 **%p** 변화, 세션 30 미만 제외 — 소량 트래픽 페이지의 이탈률 요동으로 인한 오독 방지), `entry_paths`(채널→착지 페이지 상위 N + 점유율), `purchase_funnel`(단계별 건수/직전단계 통과율/전체 대비/병목 자동 지목), `funnel_by_channel`(채널별 시작→결제완료 전환율 비교), `prev_period`(직전 동일 길이 기간) 추가.
  - API: `/api/ga4/site`, `/api/ga4/channels`, `/api/ga4/pages`, `/api/ga4/journey`(4가지 분석을 한 번에 — 프론트 왕복 축소). `channels`·`journey` 는 비교기간 미지정 시 직전 동일 길이 기간을 자동 적용. `keek-api-smoke.yml` 에 4개 모두 추가.
  - 프론트: `Ga4Page.tsx` 신설 + `App.tsx` 4번째 탭("유입·구매 경로(GA4)"). 요약 KPI → 일자별 추이 → ①채널별 세션·전환(매체 원본 펼치기, 증감) → ②채널별 첫 착지 페이지 → ③퍼널(병목 단계 주황 강조 + 채널 필터) → ④이탈률 상승 페이지(%p, +5%p 초과는 행 강조) → 많이 본 페이지. `styles.css` 에 `.funnel-*`, `.entry-*`, `.linkish`, `.sub-row`, `.warn-row` 추가.
  - mock 데이터는 keek 의 **실제 source/medium 문자열**(`criteo / display`, `sns / meta`, `naver / gfa`, `KK_powerlink_MO / powerlink`, `KK_BS_MO / bs` 등)을 그대로 써서 채널 매핑·라벨까지 mock 에서 검증된다.
  - 테스트: `test_ga4_site.py` 19개(파서/매핑/집계/퍼널/이탈/유입경로/비교기간), `test_api_ga4.py` 4개(엔드포인트 계약).
  - **라이브 검증 완료(2026-07-29)**: 5/1~7/28 **89일 전부** GA4 수집 성공(하루 270~350건, 누락 0). `keek-api-smoke.yml` 에서 GA4 4개 엔드포인트 200 + 적재 범위/유입경로·이탈·퍼널 건수를 상시 출력하도록 추가. GA4 보관기간 때문에 과거가 비지 않을까 우려했으나 **5/1까지 정상 조회**됨(Data API 표준 리포트는 이벤트 보관기간 영향을 덜 받음).
  - **미해결 갭**: criteo(트래픽 약 42%) / 네이버 GFA(14%) / 네이버 브랜드검색(3%) 은 GA4 유입은 잡히지만 **광고비 소스가 대시보드에 없다** → 현재 ROAS 는 과대 계상 상태. 광고비 연동 전까지는 GA4 세션/전환만 신뢰할 것.
- **카페24 접속통계 연동(2026-07-30)** — Admin API 와 별도 호스트(`ca-api.cafe24data.com`, 경로 접두어 없음)인 통계 API. 문서상 "승인 제휴사 대상"이라 포기했던 것을 실제로 쏴보니 **열렸다**. 경로명을 추측하기 어려워(예: 장바구니는 `/carts/view` 가 아니라 **`/carts/action`**) 네임스페이스별 후보 60여 개를 전수 probe 해 확정. 사용 가능한 9개:
  `/visitors/view`(방문/신규/재방문) · `/visitpaths/domains`(유입 도메인) · `/visitpaths/keywords`(**실제 검색어** — GA4 는 네이버·구글이 가려 organic 까지만 보임) · `/visitpaths/ads`(광고 채널별 방문) · `/pages/view` · `/products/view` · `/products/sales` · **`/carts/action`(상품별 조회→담기→담기율)** · `/members/sales`(회원/비회원).
  없는 경로 52개도 스크립트 docstring 에 기록 — 추측으로 재호출하지 말 것.
  - **핵심 가치**: GA4 퍼널이 "장바구니 담기"를 병목으로 지목해도 *어느 상품 때문인지*는 모른다. `/carts/action` 이 상품 단위로 알려준다. 라이브 첫 확인에서 조회 1위 상품(Windbreaker V3)이 조회 2,558 / 담기 26 = **담기율 1.02%**, 2위(Vest) 2,133 / 85 = 약 4% 로 4배 차이 — 1위 상품의 가격·옵션·품절 점검이 최우선 액션.
  - `etl/cafe24_analytics.py`: `product_funnel`(담기율을 **기간 합계로 재계산** — 일자별 비율 합산은 틀린 값), `cart_bottleneck`(담기율 **중위값의 절반 미만**인 상품 지목 — 평균은 한 상품이 튀면 기준이 흔들림), `search_keywords`/`referrer_domains`/`ad_paths`(비교기간 대비 증감 + 신규 등장 플래그), `page_report`(방문당 조회수), `member_split`.
  - API `/api/shop/analytics`(9개 블록 한 번에, 비교기간 자동). 프론트는 **별도 탭이 아니라 '카페24 어드민' 탭 안의 섹션**(`components/ShopAnalyticsSection.tsx`, 베스트 상품 바로 뒤에 삽입) — 사용자 요청. 상품 담기율은 베스트 상품·카테고리 매출과 나란히 봐야 의미가 살고(조회는 많은데 안 팔리는 상품), 유입 검색어도 방문자 지표 옆이 자연스럽다.
  - 섹션에는 **상단 KPI 카드와 방문 추이를 일부러 넣지 않았다** — 어드민 탭에 이미 GA4 기준 방문자 카드·추이가 있어 카페24 '방문'(정의 다름)을 나란히 두면 오해를 준다. 대신 정의 차이를 섹션 제목 아래 한 줄로 밝힌다.
  - 데이터가 없거나 권한이 없으면 이 섹션만 조용히 접힌다(`return null`) — 어드민 탭 나머지는 그대로 보여야 하므로.
  - 통계 API 실패는 **예외로 올리지 않고 부분 실패로만 기록**(보조 지표라 하루 수집 전체를 막으면 안 됨). 단 전부 실패면 예외 → 빈 결과로 기존 데이터를 덮지 않게.
- **⚠ 사고 기록: 토큰 체인 끊김 + scope 축소 (2026-07-29~30)** — 재발 방지를 위해 상세히 남긴다.
  1. **원인**: 카페24 refresh_token 은 갱신마다 **회전**하고 직전 것이 즉시 무효다. 진단 스크립트가 DB 토큰을 **읽기만 하고 회전분을 되쓰지 않아** 그 실행은 성공하고 **다음 실행이 invalid_grant 로 사망**(재인증 필요). 수집기·verify 도 "작업 끝난 뒤 저장" 구조라 중간에 죽으면 같은 결함.
  2. **수정**: `Cafe24Client` 에 `token_sink` 훅 + **`from_store(config, store)` 팩토리** 추가 — 갱신되는 **그 순간** DB 에 되쓴다. 토큰을 쓰는 6곳 전부 전환. 회귀 테스트 2종(`test_cafe24_token_rotation.py`).
  3. **2차 사고**: 재인증을 `mall.read_order,mall.read_customer` 만으로 해서 원래보다 scope 가 좁아졌다 → 후기·품절·통계가 전부 막혔는데 **오류가 아니라 '지표 결측'처럼 보였다**(가장 위험한 실패 모드). `DEFAULT_SCOPE` 를 실제 필요 범위 7개로 확대(order/customer/community/product/category/application/analytics).
  4. **redirect_uri**: 워크플로·문서에 `https://coversomeone1.cafe24.com/` 로 적혀 있었지만 앱 등록값은 **`https://keek-ops-dashboard.onrender.com`**. 전부 교정.
  5. **인가코드 1분 만료**: 기존 bootstrap 은 checkout+setup-python+pip 로 준비에만 30초 이상 써서 반복 실패했다. **`cafe24-token-fast.yml`** 신설 — checkout/setup-python/pip 전부 없이 stdlib urllib 로 즉시 교환(실측 2초), DB 저장은 그 뒤에. 부여된 scope 를 출력하고 필수 권한 누락을 경고하며 `app_kv.cafe24_token_scopes` 에 저장.
  6. **복구 절차**: `cafe24-authorize-url.yml`(승인 URL 생성 — client_id 는 Actions 마스킹을 피해 첫 글자만 퍼센트 인코딩) → 브라우저 승인 → `cafe24-token-fast.yml` 에 code 입력. **사람이 직접 눌러야 함**(에이전트를 거치면 그 왕복에서 1분 초과).
- 테스트 155개 통과

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
