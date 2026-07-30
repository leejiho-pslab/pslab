# SNS 채널 자동화 시스템 — 스킬 패키지

> 브랜드 하나의 SNS(**인스타그램·스레드·구글블로그·네이버블로그·유튜브·링크드인**)를
> **무료로 24시간 무인 운영**하는 완성형 시스템의 Claude 스킬입니다.
> 매일 정해진 시각 자동발행, AI(클로드) 글 생성, 한글 카드/블로그 이미지 렌더, 유튜브 쇼츠
> 모션영상(힉스필드)+무료 BGM, 실시간 대시보드(GitHub Pages), 성과 자체학습 선순환까지 포함합니다.

이 패키지는 그 스킬을 **다른 Claude 환경에서도 쓸 수 있도록 압축한 것**입니다.

---

## ⚠️ 먼저 읽어주세요 — 이 스킬의 성격

레퍼런스 생성 스킬과 달리, **이 스킬은 독립 실행 도구가 아니라 `pslab` 저장소(코드베이스) 전체를
전제로 한 "운영 안내서 + 재사용 절차"입니다.**

- `SKILL.md` 안의 파일 경로(`src/core/*.ts`, `src/plugins/*.ts`, `scripts/*.mjs`,
  `.github/workflows/*.yml`)는 **모두 `pslab` 저장소에 있는 실제 구현체**를 가리킵니다.
- 따라서 이 스킬을 제대로 쓰려면 **`pslab` 저장소(또는 그 복제본)가 함께 있어야** 합니다.
- 스킬 파일만 있으면 Claude가 "무엇을·어떤 순서로·어디를 고쳐야 하는지"는 알지만,
  실제로 돌릴 코드는 저장소에서 가져와야 합니다.

> **정리**: 이 zip은 "스킬 정의 + 시스템 지도 + 온보딩 절차"입니다.
> 실제 시스템 코드는 `pslab` 저장소를 복제(clone)해서 확보하세요.

---

## 📦 패키지 구성

```
sns채널-자동화-스킬-패키지/
├── README.md              ← 지금 이 파일 (사용법 + 시스템 개요)
└── sns채널-자동화/
    └── SKILL.md           ← 스킬 정의 + 아키텍처/온보딩/함정 전체 (9개 섹션)
```

`SKILL.md` 한 파일에 시스템 전체가 문서화되어 있습니다(별도 번들 스크립트 없음 —
실제 스크립트는 아래 "저장소 파일 지도"의 파일들입니다).

---

## 🚀 다른 Claude에서 사용하기

### 1단계 — 스킬 설치

```bash
unzip sns채널-자동화-스킬-패키지.zip
mkdir -p ~/.claude/skills
cp -r sns채널-자동화-스킬-패키지/sns채널-자동화 ~/.claude/skills/
```

- 프로젝트 단위: `<프로젝트루트>/.claude/skills/sns채널-자동화/`
- 전역: `~/.claude/skills/sns채널-자동화/`
- 확인: 새 세션에서 `/` → 스킬 목록에 `sns채널-자동화` 가 보이면 성공.

### 2단계 — 시스템 코드 확보 (필수)

이 스킬은 `pslab` 저장소 코드를 조작합니다. 다음 중 하나로 코드를 준비하세요:

- **기존 저장소에서 이어서 작업**: `pslab` 저장소를 clone 한 폴더에서 Claude Code 세션을 엽니다.
- **새 브랜드용으로 복제 배포**: `pslab`을 통째로 fork/clone → 새 저장소로 만들어 별도 운영.
  (업체별로 브랜드·콘텐츠·성과가 섞이면 안 됩니다 — `SKILL.md §8` 배포 충돌 교훈 참고)

### 3단계 — 자연어로 지시

> "새 업체 '○○카페' SNS 무인 자동운영 세팅해줘. 인스타·유튜브·블로그, 매일 18시 발행."
> "대시보드가 안 뜬다 / 발행이 멈췄다 — 점검해줘."

스킬이 자동 발동해서 `SKILL.md`의 온보딩 절차·점검 체크리스트대로 진행합니다.

---

## 🧩 시스템 개요 (SKILL.md 요약)

### 핵심 철학
**"대시보드가 곧 제품이다."** 모든 결과는 GitHub Pages 대시보드에서 링크로 확인 가능해야 하고,
설명은 비개발자 담당자를 위해 쉬운 한국어로.

### 기능 3축
| 축 | 내용 |
|---|---|
| **자동 발행** | 매일 정해진 시각(기본 18시 KST) 하루 1개씩 채널 라운드로빈 게시 |
| **콘텐츠 생성** | 글=클로드 AI(폴백 규칙기반) / 한글 이미지=HTML→Chromium / 유튜브 쇼츠=힉스필드+무료 BGM |
| **자체 학습** | 발행 → 반응 수집 → `learning.json` → 다음 기획에 디자인·주제·시간대 반영 |

### 채널별 자동화 가능 여부
| 채널 | 자동발행 | 핵심 |
|---|---|---|
| 인스타그램 | ✅ | Graph API 캐러셀. 공개범위=계정 설정을 따름(전문가 계정=공개) |
| 스레드 | ✅ | Threads API |
| 구글 블로그 | ✅ | Blogger API v3 (OAuth refresh token) |
| 링크드인 | ✅ | Posts API (토큰 ~60일 만료, 수동 재발급) |
| 유튜브 | ✅ | Data API v3. **공개범위 기본값 반드시 `public`**. 미검수 앱은 토큰 7일마다 만료 |
| 네이버 블로그 | ❌ 수동 | 발행 API 없음 → 대시보드 복붙+이미지 다운로드 |

### 무인 안전장치
1. 발행 실패 즉시 텔레그램 푸시  2. 토큰 조기경보(유튜브·블로거·링크드인 매 사이클 점검)
3. 미설정 채널 vs 실제 사고 구분  4. `timedFetch` 타임아웃 + 워크플로 `timeout-minutes`

---

## 🗺️ 저장소 파일 지도 (`pslab` 코드베이스)

스킬이 조작하는 실제 파일들입니다. 새 환경에선 **이 파일들이 있는 `pslab` 저장소가 있어야** 합니다.

**코어 (`src/core/`)** — 27개 모듈:
`client.ts`(클라이언트 로드), `plan.ts`(기획안), `publisher.ts`, `registry.ts`, `plugin.ts`,
`claude.ts`(AI 글), `generate.ts`(기획+학습 반영), `content.ts`, `providers.ts`,
`orchestrator.ts`(사이클 총괄), `research.ts`, `insight.ts`/`analytics.ts`(성과),
`learning.ts`(자체학습), `dashboard.ts`(상황판 HTML), `guidance.ts`(지침 시스템),
`notify.ts`/`alerts.ts`(텔레그램), `weekly.ts`(주간리포트), `token-health.ts`(토큰 점검),
`scheduler.ts`, `board.ts`, `council.ts`, `review.ts`, `design.ts`, `config.ts`, `types.ts`, `logger.ts`

**채널 플러그인 (`src/plugins/`)**:
`instagram.ts`, `threads.ts`, `blogger.ts`, `linkedin.ts`, `naver-blog.ts`, `youtube.ts`, `shared.ts`

**렌더/미디어 스크립트 (`scripts/`)**:
`render-cards.mjs`(인스타 캐러셀), `render-blog-images.mjs`(블로그 대표+본문 이미지),
`render-shorts.mjs`(쇼츠 오버레이), `build-shorts-video.mjs`(부메랑 배경+오버레이+BGM),
`fetch-photos.mjs`(배경사진 CI 다운로드), `seed-*.mjs`(초기 시드),
`schedule-daily.mjs`(일일 재배치), `sync-guidance.mjs`(지침 반영)

**워크플로 (`.github/workflows/`)**:
`pslab-cron.yml`(무인 루프+Pages 배포), `pslab-publish.yml`, `pages-deploy.yml`,
`guidance-sync.yml`(지침 이슈 반영)

**설정/데이터**:
`clients/<id>.json`(ClientConfig — 계정·채널링크·발행시각. 템플릿: `clients/demo-cafe.example.json`, 실제: `clients/pslab.json`),
`data/clients/<id>/`(plan.json·design.json·learning.json·bg-sources.json·video-sources.json 등,
**기본 gitignore → 시드는 반드시 `git add -f`**)

---

## ✅ 새 업체 온보딩 체크리스트 (SKILL.md §9)

```
[ ] clients/<id>.json 설정 (accounts, channelLinks, scheduleTimes 등)
[ ] data/clients/<id>/ 설정 + design.json (템플릿 복사, 시드파일은 git add -f)
[ ] seed-plan/generate 로 plan.json 생성
[ ] 채널 토큰 → GitHub Secrets (코드에 절대 넣지 말 것)
[ ] ANTHROPIC_API_KEY (+ PSLAB_CLAUDE_MODEL=claude-haiku-4-5 로 비용절감)
[ ] schedule-daily.mjs 로 매일 18시 배치
[ ] Variables PSLAB_DRY_RUN=false (기본 true=안전 시뮬레이션)
[ ] Settings→Pages→Source=GitHub Actions (repo는 public — 무료 플랜)
[ ] 워크플로 수동 실행 → 대시보드 5/5 + 채널 바로가기 확인 → 첫 발행·텔레그램 확인
```

## 💰 비용
거의 전부 무료(Actions·Pages·Chromium·ffmpeg). 유료는 선택 요소만 —
클로드 API(Haiku 월 ~1~2천원 / Opus ~5~10천원), 힉스필드 영상(편당 ~10크레딧).

## 🕳️ 반드시 아는 함정 (SKILL.md §8)
- 개발환경은 외부 호스트 접근 불가 → 미디어는 **CI에서 다운로드/합성**
- 한글은 **HTML→Chromium** 렌더 (AI 확산 이미지에 한글 넣으면 깨짐)
- private 저장소는 무료 Pages 꺼짐(404), visibility 바꾸면 Pages Source 초기화
- `data/clients/**`는 gitignore → 시드 파일 `git add -f` 안 하면 CI가 렌더를 조용히 건너뜀
- Pages 배포 워크플로는 concurrency group 통일(동시배포 404 방지), 커밋에 `[skip ci]` 금지

---

_전체 상세는 `sns채널-자동화/SKILL.md`(9개 섹션)를 참고하세요. 레퍼런스 구현 = PSLAB SNS 자동운영 저장소._
