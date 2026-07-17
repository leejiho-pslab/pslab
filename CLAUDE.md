# CLAUDE.md — SNS 자동화 시스템 작업 허브

> 이 파일은 세션마다 자동 로드된다. **내용을 담지 않고 인덱스만** 둔다 — 상세는 아래 지도가
> 가리키는 문서를 **필요할 때 읽는다**. 코드를 고치면 그 개념의 문서도 **같은 커밋에서 갱신**한다.

## 정체성
`pslab`은 브랜드의 SNS를 **무료·24시간·무인**으로 운영하는 시스템의 **레퍼런스 구현**이다.
(이 저장소는 다른 클라이언트·범용 스킬도 호스팅하지만, **이 허브의 범위는 `sns채널-자동화` 시스템**이다.)
핵심 철학: **대시보드가 곧 제품이다.** 신규 업체는 스킬 §0 표준 진행 순서를 **검수 게이트**로 밟는다.

## 🧭 최상위 작업 규약 (반드시 지킴)
1. **실구현·문서 파편화 금지** — 한 사실은 **한 곳에만**(단일 출처). 문서는 **실제 파일 경로·명령에 앵커**.
   코드가 바뀌면 매핑된 문서를 **같은 커밋**에서 갱신. 문서끼리 내용 복제 금지 — **링크로만** 참조.
2. **기억·갱신 루프** — 작업 전 아래 인덱스 + 관련 `adr/`(결정 이력)를 먼저 읽는다 → 작업 →
   되돌리기 어려운 결정·반복 함정이면 **ADR 추가**하고 how 문서 갱신.
3. **문서 계층** — **CLAUDE.md/SKILL.md = 인덱스(라우터)**, **docs/ = 어떻게(how)**, **adr/ = 왜(why)**.

## 📑 개념 인덱스 (문서 지도 · 필요할 때 해당 문서를 읽는다)
스킬 홈: `.claude/skills/sns채널-자동화/` — 아래 문서·ADR·실구현이 모두 여기 앵커된다.

| 개념 | 무엇을 다루나 | how 문서 | 실구현 앵커 |
|---|---|---|---|
| C1 시스템 개요·철학 | 무료 24h 무인·대시보드=제품·멀티클라이언트·검수게이트 | `docs/00-개요와-온보딩.md` | `src/core/orchestrator·daemon.ts` |
| C2 도메인·데이터 모델 | `ClientConfig` + `data/clients/<id>/*` 데이터 계약·격리 | `docs/01-도메인-데이터.md` | `src/core/client·types·config·plan.ts` |
| C3 콘텐츠 생성 엔진 | AI글·렌더원칙(HTML→Chromium·세이프존·가짜글자)·이미지전면형·영상·미디어조달 | `docs/02-콘텐츠-엔진.md` | `scripts/render-*·build-shorts-video·fetch-photos`, `src/core/content·generate·design.ts` |
| C4 기획 지능 | 키워드3시트·차주스케줄링·운영자지침v3·자체학습·레퍼런스벤치마킹수집 | `docs/03-기획-지능.md` | `scripts/fetch-keywords·plan-week·fetch-references`, `src/core/guidance·insight·learning.ts` |
| C5 채널 연동·인증 | 플러그인구조·자동/수동채널·토큰발급플레이북·토큰건강 | `docs/04-채널연동.md` | `src/plugins/*`, `src/core/token-health·registry.ts` |
| C6 발행·스케줄링 | publish 멱등·일일배치·DRY_RUN·무인안전장치3종 | `docs/05-발행-스케줄링.md` | `src/core/publisher·scheduler·notify·alerts.ts`, `scripts/schedule-daily` |
| C7 대시보드(관제·제품) | 구성·기간·수정요청·지침탭·차주기획·키워드3시트·채널스코프·템플릿리터럴함정 | `docs/06-대시보드.md` | `src/core/dashboard·board.ts` |
| C8 인프라·배포 | Actions cron루프·Pages·concurrency·`[skip ci]`함정·워크플로지도 | `docs/07-인프라-배포.md` | `.github/workflows/*` |
| C9 온보딩 프로세스 | §0 표준 7단계 + 검수 게이트·빠른시작 체크 | `docs/00-개요와-온보딩.md` | (운영 절차) |
| C10 함정·결정 이력 | 하드원 교훈 요약 + **왜의 단일 출처** | `docs/08-함정과-결정.md` → `adr/` | `adr/README.md` |

- **스킬 라우터**: `.claude/skills/sns채널-자동화/SKILL.md` (트리거·§0 요약 + 위 문서 링크)
- **결정 이력**: `.claude/skills/sns채널-자동화/adr/README.md` (ADR 인덱스·규약)
- **클라이언트 인스턴스**: 각 업체는 별도 저장소(예: `dongsung`)로 분리. 그쪽 `CLAUDE.md`는 이 허브를 가리키는 얇은 포인터 + 업체 특화 데이터만 보유.

> 이 지도에 문서를 더하거나 개념이 바뀌면 **이 표를 함께 갱신**한다(인덱스와 실제 문서가 어긋나지 않게).
