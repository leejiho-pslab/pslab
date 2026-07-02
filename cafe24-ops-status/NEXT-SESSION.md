# 다음 세션 인수인계 (메종YS 운영/광고 대시보드)

> ⚠️ **반드시 이 저장소에서 새 세션을 시작할 것: `leejiho-pslab/pslab`**
> 브랜치: **`claude/maison24-dashboard-setup-zlh3vq`** — 메종YS(MAISON YS) 전용 작업 브랜치.
> 이 저장소의 `claude/eager-lamport-mX0eT` 브랜치는 **다른 업체(keek)의 운영 브랜치**이니
> 혼동하지 말 것 — 서로 다른 업체는 서로 다른 브랜치(또는 별도 포크)로 독립 운영한다.
> 새 대화 킥오프 한 줄:
> **"leejiho-pslab/pslab 저장소 claude/maison24-dashboard-setup-zlh3vq 브랜치에서
> cafe24-ops-status/NEXT-SESSION.md 읽고 이어서 진행해줘"**

## 1. 프로젝트 한눈에

카페24 자사몰(**MAISON YS**, maisonys.com — (주)와이에스콜렉션, 샤틴·에스블랑·헌치 공식몰)의
매출·광고·소재·경쟁사·방문자를 매일 무인 수집해 React 대시보드로 보여주는 **완전 무료** 자동화 시스템.
`카페24-운영현황` + `온라인-광고` 두 스킬로 세팅됨(공용 프로젝트 `cafe24-ops-status/`).

- **라이브 대시보드**: 미배포 — Render 배포 후 `https://maisonys-ops-dashboard.onrender.com` 예정
- **저장소**: `leejiho-pslab/pslab`, 프로젝트 폴더 `cafe24-ops-status/`
- **무료 스택**: GitHub Actions(수집) · Neon Postgres(`DATABASE_URL`) · Render Web(웹/API)
- **파이프라인**: 수집 → 정규화 → 집계(`kpi_daily`) → Neon(`facts`) → FastAPI(`api/main.py`) → React(`dashboard/`)
- **대시보드 4탭**: 카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링

## 2. 브랜치 / 배포 (중요)

- 이 브랜치(`claude/maison24-dashboard-setup-zlh3vq`)는 메종YS 전용 — 아직 어떤 Render 서비스도
  연결되어 있지 않다(뼈대 세팅만 완료). 실 연결(카페24/GA4/광고 Secrets 등록 후) Render Blueprint를
  이 브랜치에 연결해 배포한다.
- 다른 업체(keek)는 `claude/eager-lamport-mX0eT` 브랜치에서 별도로 운영 중이며, 이 브랜치 작업은
  그쪽에 영향을 주지 않는다(반대도 마찬가지). 두 브랜치를 서로 병합/치리픽하지 말 것.
- 에이전트 샌드박스는 onrender/Neon egress가 막혀 **라이브를 직접 못 친다** → 배포 후에는
  GitHub Actions 워크플로(`keek-api-smoke.yml` 등, 이름은 상속되었으나 URL은 메종YS로 교체됨)로 확인.

## 3. 스킬 (업체별 재적용)

도메인별로 분리돼 있어 신규 업체에 각각 독립 세팅 가능:
- **`/카페24-운영현황`** — 카페24 어드민 탭(매출·주문·방문자·카테고리·CRM·브리핑). 소스: 카페24 Admin API + GA4.
- **`/온라인-광고`** — 광고+광고히스토리+경쟁사 탭(ROAS·CTR·CPC·소재이미지·경쟁사). 소스: Meta/네이버SA/구글/카카오 + 네이버 DataLab/검색.
- 파일: `.claude/skills/카페24-운영현황/SKILL.md`, `.claude/skills/온라인-광고/SKILL.md`

## 4. 코드베이스 공통 기능 (keek 운영 중 개발됨 · 메종YS도 그대로 사용)

이 항목들은 `cafe24_ops`/`dashboard` 코드에 이미 구현되어 있어, 메종YS도 자격증명만
연결하면 바로 동작한다(업체별 재구현 불필요):

- 카테고리 매핑(`/admin/products?category=N`), 후기/품절 수집
- **GA4 연동**(방문자·전환율 + 신규/재방문 `newVsReturning`)
- **Meta 소재 이미지+성과**(광고 히스토리 탭, ad-level insights + 썸네일)
- 광고비 KPI 합산(`aggregate_daily`가 ads 소스 합산 → 광고매출/매출대비비율)
- 요약 카드 = 선택 기간 합계(기간비교표와 일치, `/api/summary?from=&to=`)
- "어제" 기간 전 탭 + 타임존(UTC) 처리 + "어제"=조회일 당일 정의
- 방문자 상세 카드(신규/재방문/재방문율/회원가입율) + 방문자 추이 그래프
- 오늘의 브리핑 전문 분석 코멘트(전일/전주/전년, 평균 급등락, 이상치, 광고 분리)
- 콜드스타트 방지 keepalive + 스모크 워크플로(URL은 이 브랜치에서 메종YS로 교체됨)
- 스킬 2종 분리(운영현황/온라인광고)
- 테스트 79개 통과(이 코드베이스 공통 — 브랜드 무관)

## 4-1. 이 브랜치(메종YS)에서 진행된 작업

- `config/sources.yaml`: shop(mall_id 추정값/brand) · 경쟁사(예시)를 메종YS로 교체
- `config/metrics.yaml`: 카테고리 그룹을 메종YS 실제 카테고리(OUTER/BOTTOM/OUTLET/NEW/BEST 확인됨)로 교체
- `render.yaml` 서비스명, 대시보드 타이틀/헤더, keepalive/smoke URL, 토큰 부트스트랩 redirect_uri 교체
- mock 데모 데이터(베스트 상품/광고 소재명)를 메종YS 브랜드(샤틴/에스블랑/헌치)로 교체
- `notify.py` Slack 브리핑 제목을 `sources.yaml`의 brand 설정값을 사용하도록 수정(하드코딩 제거)
- 문서(GITHUB-ACTIONS.md 등)에 남아있던 이전 업체(keek)의 실제 카페24 Client ID·Meta 광고계정
  ID·비즈니스명이 노출되어 있어 제거/일반화함
- **아직 자격증명 미연결**(DB/카페24/GA4/광고/네이버) — 아래 "필수 확인 사항" 참고

## 5. 남은 일 / 알려진 갭

- **신규가입수·회원가입율 "—"**: 특정 날짜 카페24 `count_new_customers`가 값을 못 받음 → 회원 API 응답/스코프 점검 필요.
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
