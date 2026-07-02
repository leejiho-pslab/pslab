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
- 테스트 79개 통과

## 5. 남은 일 / 알려진 갭

- **신규가입수·회원가입율 "—" — 근본 원인 확정, 카페24 Admin API로는 불가능(라이브 검증 완료)**:
  - latch 버그(일시적 오류에 프로세스 전체 영구비활성화) 수정, 401/403/404/405/422/501을 구조적 오류로 분류(422도 포함 — 재시도해도 100% 반복 실패 확인됨).
  - **라이브에서 두 엔드포인트 모두 확정적으로 실패 확인**:
    `count: 404 for /api/v2/admin/customers/count :: {"error":{"code":404,"message":"No API found."}}`
    `list: 422 for /api/v2/admin/customers :: {"error":{"code":422,"message":"Please enter the cellphone or member_id parameter."}}`
    → `/customers/count`는 API 자체가 존재하지 않고, `/customers`(목록)는 `member_id`/`cellphone` 필수라 기간별 대량조회를 지원하지 않는다. **파라미터 수정으로 고칠 수 있는 문제가 아니다.**
  - **GA4 대안도 확인해봤으나 불가**: `cafe24-ga4-diag.yml`로 최근 8일 이벤트명 전수 확인(`page_view, session_start, 클릭, first_visit, 제품분류_클릭, buy_now_버튼_클릭, user_engagement, 장바구니_보기, 구매하기_버튼_클릭, 장바구니_버튼_클릭, 결제완료, 관심상품_버튼_클릭` — 12개) → **회원가입 관련 이벤트가 전혀 없음**. 스토어프론트에 가입완료 시 GA4 이벤트를 새로 심어야 하는데(관리자 페이지/GTM 편집, 이 프로젝트 범위 밖), 사용자가 보류.
  - **다음 세션 TODO — 사용자 액션 필요**: 카페24 Admin API와 별개인 **"카페24 Analytics API"**(`cafe24data`, 도메인 `ca-api.cafe24data.com`, scope `mall.analytics`)가 존재하며 "회원/비회원 구분 통계"를 제공한다고 함 — 신규가입수 소스가 될 가능성. 단, **기존 admin 앱과 별도의 OAuth 2.0 인증/앱등록이 필요**(공식 문서: "별도의 OAuth 2.0 인증 프로세스로만 접근 가능"). 에이전트 샌드박스에서 `developers.cafe24.com` 계열 전 도메인이 WebFetch 403으로 막혀 정확한 등록 절차·엔드포인트 스펙을 확인 못함.
    1. 사용자가 직접 https://developers.cafe24.com/data/front/cafe24dataapi 에서 Analytics API 개발사 등록 + OAuth 인증을 완료해 client_id/secret(or access_token) 확보
    2. 확보한 자격증명 + 실제 엔드포인트 문서(회원 통계 관련 섹션)를 다음 세션에 공유하면 `cafe24_ops/clients/cafe24data.py` 클라이언트 신규 작성 + 수집기 연동 진행
    3. 그전까지는 신규가입수는 정직하게 "—"(미연동) 상태 유지가 맞음(추측성 코드 작성 지양).
  - 진단 인프라는 준비됨: `log.warning("신규가입수 수집 실패(...): ...")`가 latch 여부와 무관하게 매번 실제 HTTP 상태/사유(count+list 조합)를 노출(`cafe24-daily-collect.yml` 로그). `cafe24-verify.yml`(mode=db)도 커버리지/최근값 리포트. `scripts/ga4_diag.py`는 이벤트명별 건수까지 진단.
- **⛔ 미연동 지표**(정직하게 표시 중): 순매출·취소/환불(환불 API), 문자·알림톡·카카오 발송(발송 솔루션), 장바구니·재고·입고·외부채널(카페24 재고/장바구니 API). 필요 API 붙이면 채워짐.
- **도메인 완전 분리 배포**(선택): 지금은 미연동 소스 자동 스킵으로 한 대시보드에 공존. 업체별 별도 URL 원하면 `App.tsx`의 `TABS` 축소 + `render.yaml` 서비스명 분리 필요.
- Slack 알림: 사용자 요청으로 **홀딩 중**.

## 6. 운영/검증 워크플로 (GitHub Actions, 수동 실행 가능)

- `cafe24-daily-collect.yml` — 매일 08:00 KST 전 채널 수집(수동 `days:N` 백필). **기본 브랜치에서 실행.**
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
