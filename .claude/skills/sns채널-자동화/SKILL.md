---
name: sns채널-자동화
description: >-
  SNS 채널 자동 운영 시스템 — 브랜드/업체의 SNS(인스타그램·스레드·구글블로그·네이버블로그·유튜브·링크드인)를
  24시간 무인 자동 운영하는 시스템을 새 업체에 세팅하거나 점검/수정할 때 사용. 매일 정해진 시각 자동발행,
  AI(클로드) 글 생성, 한글 카드/블로그 이미지 렌더(대표이미지 포함), 릴스/쇼츠 멀티씬 영상(힉스필드, 무음),
  실시간 대시보드(GitHub Pages, 채널 바로가기 포함), 실측 성과 자체학습 선순환까지 포함. "다른 업체에도 적용",
  "새 클라이언트 SNS 자동화 세팅", "SNS 무인 운영 붙여줘", "대시보드가 안 뜬다", "발행이 멈췄다" 같은
  요청에 사용.
---

# SNS 채널 자동화 (sns채널-자동화)

브랜드 하나의 SNS를 **무료로 24시간 무인 운영**하는 완성형 시스템. 이 저장소(`pslab`)가
레퍼런스 구현이며, 아래 절차대로 **새 업체(client)를 추가**하면 그대로 재사용된다.

> 핵심 철학: **대시보드가 곧 제품이다.** 모든 작업 결과는 대시보드(GitHub Pages)에서
> 링크로 확인 가능해야 한다. 비개발자 담당자를 위해 설명은 **쉬운 한국어**로.

---

## 1. 아키텍처 (무엇인가)

- **언어/런타임**: TypeScript ESM, Node 20+. import에 `.js` 확장자 사용.
- **채널 플러그인 구조**: `src/plugins/*` (BasePlugin → PluginRegistry → Publisher). 채널 추가 = 플러그인 추가.
- **무료 24시간 호스팅**: GitHub Actions cron(무인 루프) + GitHub Pages(`docs/`)로 대시보드 배포.
- **콘텐츠 생성**:
  - 글: 클로드 API(`src/core/claude.ts`) — 키 없으면 규칙기반 폴백.
  - 이미지: **HTML→Chromium 스크린샷**으로 렌더(`scripts/render-*.mjs`). AI 확산모델은 한글을 깨뜨리므로 텍스트는 반드시 HTML로.
  - 릴스/쇼츠: 힉스필드 장면 클립(비트별) + 한글 자막 오버레이 멀티씬 합성(`scripts/build-reels.mjs`) — **현재 무음**(§5).
- **자체 학습 선순환**: 발행 → 반응 수집(`collect-insights`) → `learning.json` → 다음 기획에 디자인/주제/시간대 반영.
  **지표는 반드시 실측**(유튜브는 Data API v3 statistics) — 가짜/의사 지표가 학습에 들어가면 안 됨(§8).
  디자인 변형(A/B/C)·모티프 비교는 **인스타 발행분 한정**(채널별 지표 스케일이 섞이면 왜곡).
- **멀티 클라이언트**: 모든 데이터는 `data/clients/<clientId>/` 아래. 코드/스크립트/워크플로는 공유.

### 채널별 자동화 가능 여부 (정직하게)
| 채널 | 자동발행 | 방식 |
|---|---|---|
| 인스타그램 | ✅ | Instagram Graph API — 캐러셀(자식 컨테이너) + **릴스**(media_type=REELS, 공개 video_url 필요, 커버는 `thumb_offset`). API에는 공개범위 파라미터가 없음 — 게시물 공개 여부는 **계정 설정**을 따르므로, 일부공개로 보이면 앱에서 계정을 공개(전문가 계정)로 전환 |
| 스레드 | ✅ | Threads API |
| 구글 블로그 | ✅ | Blogger API v3 (OAuth2 refresh token) |
| 링크드인 | ✅ | LinkedIn Posts API (REST, 이미지는 Images API로 별도 업로드 후 첨부) |
| 유튜브 | ✅ | YouTube Data API v3 재개형(resumable) 업로드. **공개범위 기본값은 반드시 'public'(전체 공개)** — 과거 'unlisted' 기본값으로 일부공개 사고 발생. 낮추려면 PSLAB_YOUTUBE_PRIVACY 또는 platformOptions.youtube.privacyStatus로만. 구글 앱 미검수 상태면 refresh token이 7일마다 만료 — 검수 전엔 담당자가 주기적으로 재로그인 필요 |
| 네이버 블로그 | ❌ 수동 | 공식 발행 API 없음 → 대시보드에서 본문 복사 + 이미지 다운로드 |

---

## 2. 재사용 자산 (이 저장소의 파일 지도)

**코어** (`src/core/`): `client.ts`(클라이언트 로드), `plan.ts`(기획안 저장/상태), `publisher.ts`,
`registry.ts`, `plugin.ts`, `claude.ts`(AI 글), `generate.ts`(기획 생성 + 학습 반영),
`insight.ts`(성과 수집), `learning.ts`(자체학습), `dashboard.ts`(상황판 HTML), `notify.ts`(텔레그램),
`weekly.ts`(주간리포트), `token-health.ts`(토큰 만료 점검).

**채널 플러그인** (`src/plugins/`): `instagram.ts`, `threads.ts`, `blogger.ts`, `linkedin.ts`,
`naver-blog.ts`, `youtube.ts`, `shared.ts`.

**렌더/미디어 스크립트** (`scripts/`): `render-cards.mjs`(인스타 캐러셀 — 색·레이아웃은
`design-tokens.json` 우선), `render-blog-images.mjs`, `build-reels.mjs`(릴스/쇼츠 멀티씬 합성),
`render-shorts.mjs`·`build-shorts-video.mjs`(구형 단일클립 방식), `fetch-photos.mjs`(배경 사진 CI 다운로드),
`site-view.mjs`(외부 사이트 열람·릴스 프레임 추출 — §8), `seed-*.mjs`(초기 콘텐츠 시드),
`schedule-daily.mjs`(일일 재배치).

**워크플로** (`.github/workflows/`): `pslab-cron.yml`(무인 루프+Pages 배포), `pslab-publish.yml`,
`pages-deploy.yml`(docs/ 배포).

**클라이언트 데이터** (`data/clients/<id>/`): `plan.json`(기획안), `design.json`(스타일 + AI 메모
`notes` + **운영자 지시 `humanNotes`** — 사람 지시는 AI가 못 지우고 프롬프트 최우선), `learning.json`,
`design-tokens.json`(카드 렌더러 색·레이아웃 — 코드 수정 없이 디자인 조정), `bg-sources.json`(힉스필드
배경 URL), `video-sources.json`(쇼츠 모션클립 URL), `reel-scenes.json`(릴스 비트별 대본·장면 클립 URL),
`blog-figures.json`(블로그 본문 삽입 이미지 시드), `weekly-reports.json`, `token-health.json`.
**이 폴더는 기본 gitignore 대상이니, 시드 파일은 반드시 `git add -f`로 강제 커밋할 것** (§8 참고 — 안 하면 CI가 조용히 렌더를 건너뛴다).

**설정표** (`clients/<id>.json`): `ClientConfig` — `accounts`(채널별 계정 핸들, 표시용),
`channelLinks`(대시보드 "채널 바로가기" 카드용 채널별 관리/프로필 URL. 없으면 채널별 기본
관리콘솔로 자동 폴백 — `dashboard.ts`의 `defaultManageUrl()` 참고).

---

## 3. 새 업체(client) 온보딩 — 단계별

> 같은 저장소에 client를 추가하거나(간단), 이 저장소를 통째로 복제해 별도 배포(완전 분리)도 가능.
> **업체별로 브랜드·콘텐츠·성과가 완전히 섞이지 않아야 함** (과거 다른 프로젝트가 같은 repo/Pages를
> 공유해 배포 충돌 난 사례 있음 → §8 참고).

1. **브랜드 정보 수집**: 브랜드명, 톤, 핵심 주제, 타깃, 채널 계정, 발행 시각(예: 매일 18시).
2. **클라이언트 설정 생성**: `clients/<id>.json`(`ClientConfig`) + `data/clients/<id>/`에
   `design.json` 팔레트. 기존 `demo-cafe`/`pslab`을 템플릿으로 복사해 값만 교체.
   `normalizeClientConfig`는 `reviewMode` 필드가 필요하니 누락 금지. `accounts`에 채널별 핸들,
   필요하면 `channelLinks`에 채널별 관리/프로필 URL도 채워 대시보드 "채널 바로가기" 카드가
   정확한 곳으로 연결되게 한다(비워도 기본 관리콘솔로 폴백은 됨).
3. **초기 기획안 생성**: `seed-plan.mjs`/`generate.ts`로 주제·슬라이드 생성 → `plan.json`
   (status=`planned`). 채널·주제는 브랜드에 맞게.
4. **채널 시크릿 등록**: GitHub 저장소 Settings → Secrets에 채널별 토큰(§4). **코드에 절대 넣지 말 것.**
5. **AI 글 켜기(선택)**: `ANTHROPIC_API_KEY` 시크릿 + (비용절감) Variables `PSLAB_CLAUDE_MODEL=claude-haiku-4-5`.
   없으면 규칙기반으로 안전 동작.
6. **일정 배치**: `node scripts/schedule-daily.mjs --client <id>` → 하루 1개씩 18:00 KST, 채널 라운드로빈.
   cron은 `0 9 * * *`(09:00 UTC = 18:00 KST) + `30 9 * * *` 보정.
7. **실제 발행 ON**: Variables `PSLAB_DRY_RUN=false` (기본 true = 안전 시뮬레이션).
8. **Pages 켜기**: Settings → Pages → Source = **GitHub Actions**. **무료 플랜은 public 저장소만 Pages 지원**
   (private면 404). 시크릿은 public이어도 노출 안 됨.
9. **검증**: 워크플로 수동 실행 → 대시보드(`https://<owner>.github.io/<repo>`)에서 체크리스트 5/5,
   일정, 카드/영상 확인 → 예정시각에 첫 자동발행 + 텔레그램 알림 확인.

---

## 4. 채널 연동 가이드 (담당자가 발급할 것)

각 채널 토큰을 GitHub **Secrets**에 넣는다. 이름은 `pslab-cron.yml`의 env 블록 참고.

- **인스타그램/스레드**: Meta 개발자 앱 → 페이지/IG 비즈니스 계정 연결 → 장기 액세스 토큰.
  `PSLAB_INSTAGRAM_ACCESS_TOKEN`, `PSLAB_INSTAGRAM_IG_USER_ID`, `PSLAB_THREADS_ACCESS_TOKEN`,
  `PSLAB_THREADS_THREADS_USER_ID`. (앱ID/시크릿 넣으면 토큰 만료일 계산·경고 가능)
- **구글 블로그(Blogger)**: Google Cloud 프로젝트 → Blogger API 활성화 → OAuth 클라이언트 →
  OAuth Playground로 `refresh_token` 발급. `PSLAB_BLOGGER_CLIENT_ID/CLIENT_SECRET/REFRESH_TOKEN/BLOG_ID`.
- **링크드인**: LinkedIn 개발자 앱(Developer Portal) → "Share on LinkedIn"/"Sign In with LinkedIn"
  제품 추가 → OAuth로 사용자 접근 토큰 발급(보통 60일 만료, 자동 갱신 불가 — 만료 전 재발급 필요).
  `PSLAB_LINKEDIN_ACCESS_TOKEN`, `PSLAB_LINKEDIN_AUTHOR_URN`(`urn:li:person:...` 또는
  `urn:li:organization:...`).
- **유튜브**: Google Cloud 프로젝트 → YouTube Data API v3 활성화 → OAuth 클라이언트 →
  OAuth Playground로 `refresh_token` 발급(스코프 `youtube.upload`). `PSLAB_YOUTUBE_CLIENT_ID/
  CLIENT_SECRET/REFRESH_TOKEN/CHANNEL_ID`. **구글 앱을 검수(인증)받지 않으면 OAuth 동의가
  "테스트" 상태로 남아 refresh token이 7일마다 만료** — 그때마다 OAuth Playground에서
  재발급해 시크릿을 갱신해야 무인 업로드가 이어진다. 완전 무인을 원하면 앱 검수(개인정보처리방침
  페이지 필요, 보통 며칠~몇 주 소요)를 받을 것.
- **텔레그램 알림**: @BotFather로 봇 생성 → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- **네이버 블로그**: 자동발행 불가(위 표). 대시보드 복사/다운로드 도우미로 담당자가 직접 게시.
- **AI/이미지**: `ANTHROPIC_API_KEY`(글). 배경 실사진(선택) `PEXELS_API_KEY`.

담당자 가이드는 항상 **화면 캡처를 요청받으면 어디를 누를지 짚어주는** 방식으로. `오픈-가이드.md`,
`구글블로그-연동.md` 같은 문서를 업체별로 만들어 두면 좋다.

---

## 5. 콘텐츠 파이프라인 상세

- **AI 글**: `claude.ts`가 `PSLAB_CLAUDE_MODEL`(기본 opus, 비용은 haiku) 사용. 크레딧 없으면 규칙기반.
- **한글 이미지**: `render-*.mjs`가 HTML+Pretendard(base64 인라인) → Chromium `--screenshot`.
  세이프존: 쇼츠는 상단 320/하단 480 피해 중앙 밴드. **AI 이미지로 한글 텍스트를 만들지 말 것.**
- **인물·배경 사진**: 힉스필드(`soul_2`, 9:16)로 장면 생성 → URL을 `bg-sources.json`에 저장 →
  **CI에서 다운로드**(개발환경은 외부 호스트 접근 불가, cloudfront 403). `fetch-photos.mjs`가 CI에서 받음.
- **블로그 대표이미지(커버)**: `render-blog-images.mjs`가 `docs/bg/<id>.jpg`를 배경으로 1600×900
  **가로형** `cover.png` 렌더(`coverHtml()`). 제목은 좌측 고정폭(`padding:0 720px 0 104px`)에
  배치하고 우측은 어두운 스크림(`background-position:right center` + 좌측 그라데이션)만 깔아
  **인물 사진과 제목 텍스트가 절대 겹치지 않게** 함. 네이버 등 플랫폼별 대표이미지 규격(가로형)에 맞출 것 —
  세로 카드 이미지를 그대로 대표이미지로 쓰면 사이즈가 안 맞는다.
- **네이버 블로그 본문 이미지**: 네이버는 발행 API가 없어 대시보드에서 "복붙+이미지 다운로드"로
  운영한다. 다운로드 버튼은 `captionBody`의 `![](url)` 마크다운 이미지 참조를 전부 파싱해서
  만들어야 함(대표이미지 1장만 보여주면 본문 삽입 이미지가 빠짐 — `dashboard.ts`의
  `manualHelper`가 `bodyImgs` 정규식 파싱으로 처리).
- **릴스/쇼츠 멀티씬 영상** (`build-reels.mjs` — 현행 방식, pslab 검증):
  1) 콘텐츠를 **4비트(장면) × ~3.5초 ≒ 13초**로 구성 — **15초 이내, 짧고 강하게**.
  2) 비트마다 힉스필드로 **자막 내용과 일치하는 장면 클립** 생성(kling 계열, 9:16) →
     `reel-scenes.json`에 비트별 kicker/text/accent/장면 클립 URL 저장 (**git add -f 필수** — gitignore).
  3) Chromium으로 한글 자막 오버레이(2줄 스태거, 키워드 액센트+밑줄) 렌더 → CI에서 클립 다운로드 →
     xfade 전환 + 색보정 + 진행 도트 합성.
  - **장면-텍스트 일치가 품질의 핵심** — 텍스트만 나오는 단순 영상 금지(운영자 피드백).
  - **무음 원칙(중요)**: BGM·음성 넣지 말 것 — 어색한 오디오로 품질이 떨어져 **운영자가 보류 지시**
    (2026-07, "나중에 디벨롭"). 무음 트랙(anullsrc)으로 출력한다.
  - **릴스 커버**: 영상 0초는 페이드인 검은 화면이라 그대로 두면 커버가 검게 나옴(사고 사례) →
    인스타 발행 시 `thumb_offset`(기본 900ms, `coverOffsetMs`)으로 훅이 보이는 프레임을 커버로 지정.
  - 구형 방식(단일 클립 부메랑+BGM, `build-shorts-video.mjs`)은 새 제작에 쓰지 말 것.

---

## 6. 발행·일정·대시보드

- `publish-plan --due`: `scheduledFor <= now` 이고 status가 published/manual이 아닌 항목을 발행.
  자동채널(인스타·스레드·블로거·링크드인·유튜브)은 실제 게시, 수동채널(네이버 블로그)은
  status=`manual`로 표시(대시보드에서 복붙). 유튜브 항목은 카드 이미지 없이 `videoFile`만
  있어도 발행되며 `ytTitle`/`ytDescription`/`ytTags`(SEO 메타)를 우선 사용.
  `PSLAB_DRY_RUN=true`면 상태 변경 없이 시뮬레이션(가짜 '발행됨' 방지).
- **일일 18시**: `schedule-daily.mjs`로 미발행 항목을 하루 1개씩 18:00 KST 재배치(채널 라운드로빈).
  cron `0 9 * * *` + `30 9 * * *`(보정). publish-plan은 멱등이라 중복발행 없음.
- **대시보드**(`dashboard.ts`): 채널현황·발행/대기·성과·오픈 체크리스트·주간리포트·네이버/유튜브 도우미·
  **채널 바로가기**(개요 탭 상단, 채널별 파스텔 카드 → 클릭 시 관리/프로필로 이동. `channelLinksPanel()`).
  5분 자동 새로고침. **빈 화면 방지**: 메인 스크립트 앞 `window.onerror` + 렌더 try/catch로 오류를 화면에 표시.
- **대시보드 v2 업그레이드** (라이트 테마 + 기간 + 수정요청 게시판):
  1. **라이트 테마** — 배경 화이트/폰트 블랙(`:root{color-scheme:light}`). 배지·그라데이션·인라인 색상까지
     전부 라이트 팔레트. 다크로 되돌리려면 `<style>` 블록과 JS 인라인 색상을 함께 바꿔야 함.
  2. **운영 기간 선택** — 전역 상태 `period` + `periodBar()`(전체/최근7·14·30일/이번달/지난달/직접선택 date input).
     `inPeriod(date)`로 개요·채널 상세의 KPI·추세·발행 데이터·발행됨 카드가 모두 필터됨.
  3. **메인(전체 탭)은 발행 전 콘텐츠만** — 기획안 그리드는 `status!=='published'`만. 발행분은
     "발행된 게시물 · <기간>" 섹션에서 기간 필터로 조회(기획 발행분 planCards + 사이클 발행분 병합).
  4. **채널 상세도 기간 반영** — KPI는 사이클 발행분(published)+기획 발행분(planPub)을 **합산**(mAll).
     발행 대기 목록은 발행 전만, 발행됨 목록은 기간 필터.
  5. **수정요청 게시판** (`requestsPanel()`) — 각 채널 탭 최상단. 대시보드 textarea에서 작성 →
     제목 규약 `[수정요청·<채널key>] 첫줄` 로 깃허브 이슈 생성(라벨 feedback). 백엔드 없이 동작.
  6. **처리 상태 자동 표시** — `loadIssues()`가 GitHub API(공개 repo, 무인증)로 이슈를 읽어
     제목 규약을 파싱: open=🛠 처리중, closed=✅ 처리완료. 채널 탭 메뉴에 `treq` 배지(🛠n/✅),
     채널별 요약 표에 수정요청 열. **운영자는 이슈를 닫는 것으로 '처리완료' 처리**.
- **지침 시스템(v3)** — AI가 "상시 학습"하는 운영자 입력 창구 (`src/core/guidance.ts`):
  - 대시보드 **🧭 지침 탭**: 브랜드 노트(분석/방향성/감도) 3종 + **🎨 디자인 피드백** + 채널별
    주제·핵심 가이드 작성 폼. 이슈 제목 규약 `[브랜드노트·분석|방향성|감도]`, `[디자인피드백]`,
    `[가이드·<채널key>]` (본문 `주제:` 줄 = 우선 소재 풀).
  - **guidance-sync.yml** (`on: issues`): 규약 이슈를 파싱해 `data/clients/<id>/brand-brief.json` +
    `channel-guides.json` + `design.json humanNotes`([디자인피드백] — 본문 한 줄 = 지시 1건)에 반영 →
    대시보드 재생성·커밋 → **이슈 자동 닫기(반영 완료 코멘트)** → Pages 배포.
    ※ issues 이벤트는 **기본 브랜치의 워크플로만** 실행되므로 반드시 기본 브랜치에 있어야 함.
  - **생성 파이프라인 연동**: 오케스트레이터가 사이클마다 로드 —
    채널 가이드 topics → `reinforcement.favoredTopics` 선두 + research keywords 병합(소재 선정 우선),
    브랜드 노트(`brandNotesText`) + 가이드 본문 → `ContentBrief.brandNotes/channelGuide` →
    Claude systemPrompt에 "[운영자 브랜드 노트]" / "[채널 핵심 가이드]" 블록으로 주입.
  - 각 채널 탭 상단에 현재 가이드 요약 패널(`channelGuidePanel`) 표시.
- **안정성 수칙**: 모든 외부 API 호출은 `timedFetch`(기본 60초, 유튜브 업로드 600초) 사용 —
  응답 없는 연결이 크론 잡을 몇십 분씩 묶어두는 사고 방지(2026-07-09 15분 행 사례).
  워크플로 잡에는 `timeout-minutes`(cron 25분/publish 15분/sync 15분) 필수.
  대시보드 인라인 JS의 onclick 문자열은 TS 소스에서 `\\'`(백슬래시 2개)로 이스케이프해야 함
  — `\'` 하나면 SyntaxError로 대시보드 전체가 오류 화면이 된다.
- **무인 안전장치 3종** (조용한 실패 방지):
  1. **발행 실패 즉시 푸시** — 성공뿐 아니라 채널별 실패도 텔레그램으로 알림(에러 메시지 포함).
     "발행이 며칠째 멈췄는데 아무도 몰랐다" 사태 차단.
  2. **토큰 조기경보** — `check-tokens`가 인스타/스레드(라이브 핑+만료일) 외에 **유튜브·블로거
     (refresh token 실제 교환 시도)**, **링크드인(401 감지)**까지 매 사이클 점검. "새로 생긴" 경고만
     텔레그램 푸시(반복 스팸 방지), 대시보드 배너는 해결될 때까지 계속 표시.
  3. **미설정 채널 구분** — 자격 증명이 아예 없는 채널(의도적 보류)은 조용히 대기시키고,
     자격 증명이 "있는데" 실패하면(토큰 만료 등) 사고로 취급해 알림. 보류 채널 때문에
     매일 가짜 경고가 오는 스팸과, 진짜 사고가 묻히는 것을 동시에 방지.

---

## 7. 비용

- **거의 전부 무료**: GitHub Actions(무료 분), Pages(공개 repo), 렌더(Chromium/ffmpeg).
- **유료는 선택 요소만**: 클로드 API(하루 2회, Haiku 월 ~1~2천원 / Opus ~5~10천원),
  힉스필드 영상(편당 ~10크레딧). 콘솔에서 사용 한도 걸어두면 초과 없음.

---

## 8. 반드시 아는 함정 (하드-원 교훈)

- **세션의 외부 접근은 "환경의 네트워크 정책"이 결정** — 403/000이 나오면 사이트 고장이 아니라
  정책 차단부터 의심(`curl -sS "$HTTPS_PROXY/__agentproxy/status"`로 확인). pslab 환경(Default)은
  2026-07-30 운영자가 '전체'로 개방해 네이버·유튜브·인스타 접속 가능. 정책이 닫힌 환경에서는
  기존 방식대로 **세션에서 생성→URL 저장→CI(GitHub Actions)에서 다운로드**.
- **외부 사이트 열람·발행물 검수**: `node scripts/site-view.mjs shot <url>`(스크린샷) /
  `reel <릴스url>`(인스타 릴스 mp4+3초 간격 프레임 — embed 페이지가 로그인 없이 영상을 서빙).
  **크로미움은 프록시와 TLS1.3 충돌로 그냥 쓰면 전 사이트 연결 리셋** — 이 스크립트에 TLS1.2 강제
  플래그(`--ssl-version-max=tls1.2 --disable-http2 --disable-quic`)가 내장돼 있으니 직접 크로미움을
  띄우지 말고 이걸 쓸 것. 유튜브 영상 다운로드(yt-dlp)는 데이터센터 IP 봇체크로 실패 —
  메타데이터·실조회수·자막·댓글은 YouTubeData MCP 도구로, 자사 영상 원본은 `docs/shorts/`에 있음.
- **성과 지표는 실측만** — 유튜브 플러그인이 한때 해시 기반 의사 지표(수만 뷰)를 반환해 변형 학습이
  통째로 오염된 사고(2026-07). `fetchAnalytics`는 dryRun에서만 시뮬레이션, 실발행은 실제 API 값.
  수집 실패 시 가짜로 채우지 말고 실패로 기록되게 둘 것.
- **한글은 HTML→Chromium**로 렌더. AI 확산 이미지에 한글 넣으면 깨진다.
- **private 저장소 = 무료 플랜에서 Pages 꺼짐(404)**. public 유지(시크릿은 안전). visibility 바꾸면
  Pages Source가 None으로 초기화되니 다시 `GitHub Actions`로 켜야 함.
- **GITHUB_TOKEN으로 push하면 다른 워크플로가 트리거되지 않음**(무한루프 방지). 그래서 각 워크플로가
  자기 배포 스텝을 가져야 하고, **Pages 배포하는 워크플로는 concurrency group을 통일**(예: `pages`)해야
  동시배포 경쟁(→404)이 안 생긴다. 여러 프로젝트가 한 repo/Pages를 공유하면 특히 주의.
- **커밋 메시지에 `[skip ci]` 금지**(Pages 배포까지 막힘).
- **동시 push 충돌**: 커밋 스텝에 `git pull --rebase` + 재시도.
- **가짜 성공 차단**: 자동발행 불가 채널은 publish에서 ok:false로. dry-run에선 상태 변경 안 함.
- **힉스필드 큐 지연** 가능(starter 플랜). 급하면 다른 모델(seedance/grok)로 재시도하되 큐가 풀리면
  추가 비용 없이 완료되기도 함.
- **AI 텍스트가 대시보드 데이터에 들어가도** JSON.stringify + `<` 이스케이프(`<`)로 안전.
- **`data/clients/**` 는 기본 gitignore 대상**. `blog-figures.json` 같은 시드 파일을 안 넣고
  넘어가면 CI에서 렌더 스크립트가 입력 없이 **0초만에 조용히 종료**되고, 그 결과 다운로드 링크가
  404("사용할 수 없는 파일")로 깨진다. 새 시드 데이터 파일을 추가하면 항상 `git add -f`로
  강제 커밋했는지 확인할 것.
- **"발행이 며칠째 안 된다"는 보고를 받으면**, 먼저 cron/토큰이 실제로 죽었는지부터 의심하지 말고
  ① 다음 예정 스케줄이 실제로 지났는지(`scheduledFor` 확인), ② 재배치 간격이 너무 널널하지 않은지
  (예: 하루 1개뿐이면 대기 체감이 길다), ③ Pages/저장소 visibility가 바뀌어 대시보드 확인 자체가
  막힌 건 아닌지부터 순서대로 점검. 실제 자동발행 로직은 멱등이라 재실행해도 중복 발행되지 않으므로
  `schedule-daily.mjs --perday 2` 등으로 재배치 후 워크플로 수동 트리거로 즉시 검증 가능.

---

## 9. 빠른 시작 체크리스트 (새 업체)

```
[ ] clients/<id>.json 설정 (accounts, channelLinks, scheduleTimes 등)
[ ] data/clients/<id>/ 설정 + design.json (템플릿 복사, 시드파일은 git add -f)
[ ] seed-plan/generate 로 plan.json 생성
[ ] 채널 토큰 → GitHub Secrets
[ ] ANTHROPIC_API_KEY (+ PSLAB_CLAUDE_MODEL=claude-haiku-4-5)
[ ] schedule-daily.mjs 로 매일 18시 배치
[ ] Variables PSLAB_DRY_RUN=false
[ ] Settings→Pages→Source=GitHub Actions (repo는 public)
[ ] 워크플로 수동 실행 → 대시보드 5/5 확인 + 채널 바로가기 링크 클릭 확인 → 첫 발행·텔레그램 확인
```
