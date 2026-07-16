---
name: sns채널-자동화
description: >-
  SNS 채널 자동 운영 시스템 — 브랜드/업체의 SNS(인스타그램·스레드·구글블로그·네이버블로그·유튜브·링크드인)를
  24시간 무인 자동 운영하는 시스템을 새 업체에 세팅하거나 점검/수정할 때 사용. 매일 정해진 시각 자동발행,
  AI(클로드) 글 생성, 한글 카드/블로그 이미지 렌더(대표이미지 포함), 유튜브 쇼츠 모션영상(힉스필드)+무료 BGM,
  실시간 대시보드(GitHub Pages, 채널 바로가기 포함), 성과 자체학습 선순환까지 포함. "다른 업체에도 적용",
  "새 클라이언트 SNS 자동화 세팅", "SNS 무인 운영 붙여줘", "대시보드가 안 뜬다", "발행이 멈췄다" 같은
  요청에 사용. 신규 업체는 반드시 "§0 표준 진행 순서"(①브랜드 정의·분석 → ②대시보드 뼈대만 →
  ③채널 계정 연결 → ④채널별 운영 전략 정의 → ⑤콘텐츠 기획·검수 → ⑥콘텐츠 15일치 생성 →
  ⑦자동화 ON·텔레그램 보고)를 **단계별 검수 게이트**로 순차 진행할 것.
---

# SNS 채널 자동화 (sns채널-자동화)

브랜드 하나의 SNS를 **무료로 24시간 무인 운영**하는 완성형 시스템. 이 저장소(`pslab`)가
레퍼런스 구현이며, 아래 절차대로 **새 업체(client)를 추가**하면 그대로 재사용된다.

> 핵심 철학: **대시보드가 곧 제품이다.** 모든 작업 결과는 대시보드(GitHub Pages)에서
> 링크로 확인 가능해야 한다. 비개발자 담당자를 위해 설명은 **쉬운 한국어**로.

---

## 0. 신규 업체 표준 진행 순서 (반드시 이 순서로 · 명령어)

> **신규 업체 작업 요청("○○ SNS 자동화 세팅해줘")을 받으면, 아래 7단계를 순서대로 밟는다.**
> 각 단계 끝에는 **검수 게이트(🚦)**가 있다 — 담당자 확인/승인 전에는 다음 단계로 넘어가지 않는다.
> **절대 앞질러 콘텐츠를 대량 생성하지 말 것.** 콘텐츠 생성은 ⑤ 기획 검수와 ⑥ 채널 전략 정의가
> 끝난 뒤(6단계)에만 한다. 이 순서가 이 스킬의 기본 실행 계약이다.

각 단계 시작 시 **지금 몇 단계를 하는지 한 줄로 알리고**, 끝나면 **산출물 링크 + 다음 단계 예고 +
게이트 질문**으로 마무리한다.

### ① 브랜드 정의 · 분석
- 수집·정리: 업체명·업종, 타깃(누구에게), 브랜드 톤/페르소나(누가 말하나), 핵심 주제(keywords),
  콘텐츠 기둥(contentPillars), 경쟁사/벤치마킹, 차별점, 금지어, 발행 시각.
- 산출물: `clients/<id>.json` **초안** + `data/clients/<id>/brand-brief.json`(분석/방향성/감도) 초안.
  아직 콘텐츠·이미지 없음. `reviewMode`·`manualPlan:true`(검수 우선) 세팅.
- 🚦 **게이트**: 브랜드 정의(톤·타깃·주제·채널·발행시각)를 담당자가 승인.

### ② 콘텐츠 대시보드 뼈대만 구축 (기획·제작 X)
- `data/clients/<id>/design.json`(팔레트) + **빈 기획안**(`plan.json` = `{items:[]}`)만 두고,
  대시보드가 **뜨는 것까지만** 확인. Pages Source=GitHub Actions(§3-8), repo는 public.
- **이 단계에서 콘텐츠를 기획/생성하지 않는다.** 채널 바로가기·기간바·지침 탭 등 골격만 확인.
- 🚦 **게이트**: 대시보드 링크(`https://<owner>.github.io/<repo>`)가 열리고 업체명/채널 골격 표시.

### ③ 각 SNS 채널 계정 연결
- 채널별 토큰 발급 안내(§4, **비개발자 담당자가 직접 발급할 땐 §4-1 실전 플레이북**) →
  **GitHub Secrets** 등록(코드에 넣지 말 것).
- 연결 확인: `check-tokens`(토큰 조기경보, §6-무인안전장치)로 채널별 **라이브 핑/만료일** 점검.
  자격 증명이 "있는데" 실패하면 사고로 표시, 미설정 채널은 조용히 보류.
- 텔레그램은 아직 붙이지 않는다(⑦에서). 네이버 블로그는 수동 채널(연결 대상 아님).
- 🚦 **게이트**: 연결 대상 채널이 대시보드에서 "연결됨/정상"으로 확인.

### ④ 각 채널의 SNS 운영 전략 기획 · 정의
- 채널마다 **목적·타깃·주력 포맷·톤·주제 풀·발행 빈도**를 정의(예: 인스타=제작 사례 캐러셀,
  스레드=짧은 실전 팁, 네이버=검색 유입 롱폼).
- **지침 시스템(v3)** 에 반영: `data/clients/<id>/channel-guides.json`(채널별 `주제:` 풀 = 우선 소재)
  + `brand-brief.json`. 대시보드 🧭 지침 탭 규약(`[가이드·<채널key>]`, `[브랜드노트·…]`)과 동일 구조.
  → 이후 생성 파이프라인이 `ContentBrief.channelGuide/brandNotes`로 Claude 프롬프트에 주입.
- 🚦 **게이트**: 채널별 전략(포맷·주제·빈도) 승인. 여기까지 "준비", 아직 콘텐츠 없음.

### ⑤ (전략 정의된 채널) 콘텐츠 기획 → 검수
- 전략이 정의된 채널만 **기획안** 생성: 제목·구성·캡션 개요 수준(이미지/영상 렌더는 아직 X).
  `generate-plan`(또는 `seed-*` 큐레이션) → `plan.json`(status=`planned`).
- 대시보드/문서로 **검수**. 수정요청(✏️)·지침 반영해 다듬는다.
- 🚦 **게이트**: 기획안 검수 통과(채널별). 통과한 채널만 ⑥으로.

### ⑥ (검수 완료 채널) 콘텐츠 생성 — **15일치**
- 검수 통과 채널만 실제 콘텐츠 생성: 인스타 카드(`render-cards`), 블로그 대표+본문 이미지
  (`render-blog-images`), 유튜브 쇼츠(`render-shorts`+`build-shorts-video`). 미디어는 **CI에서** 렌더/합성(§8).
- 분량 기준: **15일치**(하루 1건 기준 ~15건, 채널 라운드로빈). `schedule-daily.mjs --client <id>`로
  매일 18:00 KST 배치(필요시 `--perday`). 시드 데이터 파일은 반드시 **`git add -f`**(§8).
- 🚦 **게이트**: 생성물 **내용 체크**(카피·이미지·일정) 완료.

### ⑦ 내용 체크 후 자동화 ON + 텔레그램 보고
- 내용 확인되면 실제 발행 ON: Variables `PSLAB_DRY_RUN=false`(그 전엔 안전 시뮬레이션).
- **텔레그램 연결**: `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` → 발행 성공·실패, 토큰 조기경보,
  주간 리포트가 자동 보고되게(§6 무인 안전장치 3종).
- 🚦 **게이트**: 첫 자동발행 + 텔레그램 수신 확인 → 무인 운영 개시. 이후 대시보드로 상시 운영.

> 상세 절차/토큰 발급/함정은 아래 §3(온보딩)·§4(채널 연동)·§5(콘텐츠)·§6(발행·대시보드)·§8(함정)
> 참고. §0은 그 상세들을 **어떤 순서로, 어디서 멈춰 검수받으며** 진행할지 정한 상위 실행 순서다.

---

## 1. 아키텍처 (무엇인가)

- **언어/런타임**: TypeScript ESM, Node 20+. import에 `.js` 확장자 사용.
- **채널 플러그인 구조**: `src/plugins/*` (BasePlugin → PluginRegistry → Publisher). 채널 추가 = 플러그인 추가.
- **무료 24시간 호스팅**: GitHub Actions cron(무인 루프) + GitHub Pages(`docs/`)로 대시보드 배포.
- **콘텐츠 생성**:
  - 글: 클로드 API(`src/core/claude.ts`) — 키 없으면 규칙기반 폴백.
  - 이미지: **HTML→Chromium 스크린샷**으로 렌더(`scripts/render-*.mjs`). AI 확산모델은 한글을 깨뜨리므로 텍스트는 반드시 HTML로.
  - 유튜브 쇼츠: 힉스필드 모션클립 배경 + 한글 투명 오버레이 + 무료 BGM(`scripts/render-shorts.mjs`, `build-shorts-video.mjs`).
- **자체 학습 선순환**: 발행 → 반응 수집(`collect-insights`) → `learning.json` → 다음 기획에 디자인/주제/시간대 반영.
- **멀티 클라이언트**: 모든 데이터는 `data/clients/<clientId>/` 아래. 코드/스크립트/워크플로는 공유.

### 채널별 자동화 가능 여부 (정직하게)
| 채널 | 자동발행 | 방식 |
|---|---|---|
| 인스타그램 | ✅ | Instagram Graph API (캐러셀) API에는 공개범위 파라미터가 없음 — 게시물 공개 여부는 **계정 설정**을 따르므로, 일부공개로 보이면 앱에서 계정을 공개(전문가 계정)로 전환 |
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

**렌더/미디어 스크립트** (`scripts/`): `render-cards.mjs`(인스타 캐러셀·기본 카드뉴스),
`render-ig.mjs`(인스타 **이미지 전면형** — 실사/AI 사진 위 한글 타이틀 오버레이. `slidePhotos` 가진 항목만),
`render-blog-images.mjs`, `render-shorts.mjs`(쇼츠 슬라이드+투명 오버레이),
`build-shorts-video.mjs`(부메랑 배경+오버레이+BGM), `fetch-photos.mjs`(배경 사진 CI 다운로드),
`seed-*.mjs`(초기 콘텐츠 시드), `schedule-daily.mjs`(일일 재배치).

**워크플로** (`.github/workflows/`): `pslab-cron.yml`(무인 루프+Pages 배포), `pslab-publish.yml`,
`pages-deploy.yml`(docs/ 배포).

**클라이언트 데이터** (`data/clients/<id>/`): `plan.json`(기획안), `design.json`, `learning.json`,
`bg-sources.json`(힉스필드 배경 URL), `video-sources.json`(쇼츠 모션클립 URL),
`blog-figures.json`(블로그 본문 삽입 이미지 시드), `keyword-trends.json`(네이버 데이터랩 실 검색관심도 —
대시보드 트렌드 표의 소스), `brand-brief.json`·`channel-guides.json`(운영자 지침),
`weekly-reports.json`, `token-health.json`.
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

## 4-1. 채널 연결 실전 플레이북 (담당자가 직접 발급 · 비개발자용 · 명령)

> §0 ③단계에서 **비개발자 담당자가 직접** 토큰을 발급·연결할 때 쓰는 안내 방식. 실제 온보딩(동성인쇄소)에서
> 검증됐으니, **다른 업체에도 이 원칙 그대로** 안내한다. 목표는 "링크 열고 복붙만 하면 끝".

### 안내 원칙 (초등학생에게 설명하듯)
- **한 번에 한 파트씩.** 파트마다 목표 1줄 → 번호 스텝 → **"이렇게 되면 성공 ✅"** 체크포인트로 끝맺는다.
  한 파트 끝나면 **"N번 끝"** 확인을 받고 다음으로. 여러 파트를 앞질러 몰아치지 않는다.
- **복붙 가능하게.** Claude가 아는 값(접속 링크, 스코프 URL, 리디렉션 URI, 시크릿 이름)은 **반드시
  코드블록**으로 줘서 그대로 붙여넣게 한다. 담당자만 아는 값(토큰·ID·시크릿)은 "메모장에 복사"하도록 안내하고,
  담당자가 화면에 노출한 값은 **되읽어 주되(어느 값인지 짚기)**, 긴 비밀값을 통째로 재출력하진 않는다.
- **화면 기준으로.** "막히면 그 화면을 사진 찍어 보내달라" → 실제 화면의 **버튼 이름 그대로** 짚어준다.
  구글·메타는 UI를 자주 바꾸므로 캡처를 받으면 그 화면에 맞춰 다시 안내(예: 구 "OAuth 동의 화면" →
  신 "Google 인증 플랫폼: 브랜딩/대상/클라이언트").
- **막히는 채널은 건너뛰고 진행.** 한 채널이 막히면 세션을 멈추지 말고 **메타 없이 되는 채널(구글블로그)부터**
  연결해 진도를 뺀다. 값 발급(구글·메타 쪽)은 저장소가 없어도 되니, 값부터 메모해두고 저장은 나중에.

### 값을 넣을 곳 — 업체 전용 저장소 (pslab과 분리)
- 각 업체는 pslab이 아니라 **전용 저장소/전용 링크로 분리**한다(§8 배포 충돌 방지). 담당자가
  `github.com/new`에서 **public** 저장소를 직접 만든다(예: `dongsung` → 링크 `https://<owner>.github.io/dongsung`).
  그 저장소 **Settings→Secrets**에 토큰을 넣는다.
  ※ Claude의 GitHub 통합이 기존 repo에만 스코프면 **새 repo 생성·푸시가 막힐 수 있음**(403). 그땐 담당자가
  저장소를 만들고, 접근 권한을 부여(또는 `add_repo`)해야 Claude가 코드를 올릴 수 있다.

### 채널별 발급 순서 (요약 — 상세 값/이름은 §4)
- **인스타/스레드(메타)**: ①인스타 **프로페셔널(비즈니스) 전환** → ②**페이스북 페이지 연결** →
  ③메타 개발자 앱 생성(유형 비즈니스, **비즈니스 포트폴리오 새로 만들기**) → ④Graph API 탐색기에서 권한 5개
  (`instagram_basic`,`instagram_content_publish`,`pages_show_list`,`pages_read_engagement`,`business_management`)
  체크→토큰 생성 → `me/accounts`로 **페이지 id** → `{페이지id}?fields=instagram_business_account`로 **IG User ID**
  → ⑤`fb_exchange_token`으로 **60일 장기토큰** 교환.
- **구글블로그(Blogger)**: ①블로그 생성 → ②Google Cloud 프로젝트 + **Blogger API 사용설정** →
  ③OAuth 동의화면 **외부 + 프로덕션 게시**(테스트로 두면 refresh token 7일 만료) → ④OAuth 클라이언트(웹,
  리디렉션 `https://developers.google.com/oauthplayground`) → ⑤OAuth Playground에서 **"Use your own OAuth
  credentials"** 체크 + 스코프 `https://www.googleapis.com/auth/blogger` → **refresh token(`1//…`)** →
  ⑥블로그 URL의 `blogID=` **숫자**.

### 자주 나는 오류와 해결 (하드-원 · 담당자 안내용)
- **메타 개발자 전화 인증이 "Accounts Center에서만 가능"** → 오류 아님. 안내문의 Accounts Center 링크에서
  번호 인증하거나 **신용카드 인증**(과금 없음)으로 대체. 개발자 계정 인증은 1회성.
- **메타 비즈니스 "광고 게재 불가 / 규정 위반"** → **새 계정 자동 오탐**이 매우 흔함. 이건 **광고** 제한이고
  우리는 **무료 게시**라 게시는 가능한 경우가 많다. 일단 게시 연결을 시도하고, 병행해 `business.facebook.com/
  accountquality`에서 **검토 요청** → 보통 1~2일 내 해제.
- **인스타 연결이 "문제가 발생했습니다" 반복(웹·앱 공통)** → 새 계정 일시 차단 신호. **반복 시도 금지**
  (더 경계함), 브라우저의 **다른 FB/IG 계정 로그아웃**, **하루 대기** 후 재시도. **핸드폰 앱이 웹보다 성공률 높음**.
- **IG User ID가 안 나오거나 `instagram_business_account`가 빔** → 인스타↔페이스북 **페이지 연결이 안 된 것**.
  비즈니스 설정의 **"소유권 요청"은 오류 잦으니 피하고**, **핸드폰 인스타 앱(프로필 편집→페이지)** 또는
  Business Suite의 **"Instagram 프로필 연결(로그인)"** 로 연결.
- **Blogger `400 invalid_scope`** → 스코프 칸에 예시문구 **"Input your own scopes"** 가 들어간 것.
  칸을 비우고 **오직** `https://www.googleapis.com/auth/blogger` 만 넣는다.
- **Blogger 토큰 헷갈림** → 우리가 쓰는 건 **`refresh_token`(`1//`로 시작)**. `access_token`(`ya29…`)은
  1시간 임시라 안 씀. 입력칸이 좁아 잘려 보이니 **클릭→Ctrl+A→Ctrl+C로 전체** 복사하게 안내.
- **Blogger refresh token이 며칠 뒤 만료** → OAuth 동의화면을 **프로덕션으로 게시** 안 한 것. 프로덕션이면
  만료 안 됨(+ Playground에서 "본인 OAuth 자격증명 사용" 체크해야 24시간 자동취소도 방지).

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
- **유튜브 쇼츠 모션영상**:
  1) 힉스필드 시작이미지(`soul_2`) → `kling2_6` 이미지→영상(9:16, 5초, ~10크레딧, 무음).
  2) URL을 `video-sources.json`에 저장.
  3) `render-shorts.mjs`가 투명 오버레이(`ov-N.png`, 반투명 패널) 렌더.
  4) `build-shorts-video.mjs`가 CI에서 클립 다운로드 → **부메랑(정+역) 끊김없는 배경** → 타임드 오버레이 → BGM.
  - **무료 BGM**: `assets/bgm/*.mp3` 있으면 그것, 없으면 ffmpeg 합성 앰비언트 패드(저작권 0).
- **인스타 "이미지 전면형" 리디자인** (`render-ig.mjs` — 실사/AI 사진을 전면에 깔고 **한글 타이틀만 HTML 오버레이**):
  감성 레퍼런스 계정처럼 "사진 + 타이틀"이 기본형. plan 항목에 `slidePhotos`(슬라이드별 이미지 URL 배열)와
  `igStyle`을 주면 이 렌더러가 처리하고, `render-cards.mjs`는 `slidePhotos` 가진 인스타 항목을 자동 제외한다.
  - **3스타일 = 이미지·레이아웃·폰트·컬러를 전부 다르게**: `cinema`(영화 스틸 — 전면 사진+하단 그라데이션+큰 흰 타이틀+금색 강조),
    `photoA`(실사 카드 — 상단 레드 액센트 바+에디토리얼 커커), `photoB`(매거진 — 사진 상단+그린 컬러밴드+다른 폰트무게).
    "3개 중 1개는 시네마틱"처럼 스타일을 섞어 피드에 리듬을 준다.
  - **캐러셀은 슬라이드마다 내용에 맞는 이미지**(최소 2~3장). **이미지 재사용 금지** — 콘텐츠마다 신규 생성.
  - **글자는 절대 AI 이미지에 굽지 않는다** — 사진엔 사물·배경만(프롬프트에 `no text no letters`), 한글은 HTML 오버레이.
  - AI 생성 이미지는 캡션에 **"AI 생성 예시" 고지** 문구를 넣어 실물 오해 방지.
  - **하단 세이프존 필수**(§8 크로미움 잘림) — 타이틀·핸들은 `flex-end + padding-bottom ≥135px` 안에.
  - **공통 마감 장표**(`ig-outro.mjs`): 브랜드 강점 + 위치·연락처를 담은 마감 카드를 1회 렌더해
    **모든 캐러셀(카드뉴스)의 slideImages 끝에 append**(릴스·유튜브 제외). render-cards·render-ig 양쪽에서
    붙인다. 내용(강점 4종·연락처)은 업체별로 교체 — 브랜드 브리프의 차별점에서 뽑는다.
  - **감도 학습 루프(레퍼런스→스펙→반영)**: "게시물 감도가 아쉽다"면 ①WebSearch·네이버검색으로 트렌드/
    레퍼런스 조사 → ②`data/clients/<id>/ig-design-spec.md`(감도 규칙서)로 코드화 → ③렌더러·이미지 프롬프트가
    그 규칙을 따르게 반영. 검증된 감도 규칙: **통일 팔레트(3~5색, 강조색 1개만)**, **명조 세리프 디스플레이
    (`@fontsource/nanum-myeongjo`를 npm으로 받아 woff2를 assets/fonts에 번들·base64)+산세리프 본문**, **넓은 여백·
    슬라이드당 12단어 이내**, **커버 후킹 공식(볼드 6~10자+큐리오시티 갭)**, **이미지 통일 아트디렉션 접미어로
    피드 일관성**. 스타일은 레이아웃만 다르게, 팔레트·톤·핸들 위치는 공통. ⚠️ 개발환경 403으로 결과 이미지를
    못 보므로 텍스트 렌더(폴백)로 타이포·레이아웃만 검증 가능 — 최종 감도는 정책 허용 or 담당자 캡처로 확인.
  - **AI 가짜 글자 함정(필수)**: 확산모델(soul_2)은 **상자 정면·라벨면·병·씰/배지**가 보이면 `no text` 지시를
    무시하고 가짜 영문을 새긴다. 회피 = **라벨면이 카메라를 안 보게** — 순수 텍스처 매크로(금박·합지단면·형압)·
    탑다운 무지박스·빈 트레이·엣지/모서리·손+상자내부. **생성 후 확대 검수해 글자 없는 컷만 채택**(네트워크
    정책이 열려 있어야 눈으로 검수 가능 — cloudfront/github.io 허용).
- **블로그 개편 규칙** (네이버·구글 **각각 다른 원고**로):
  - **결론 먼저 + 기승전결**: 도입에 "🎯 결론부터/핵심부터" → 이야기 전개. **네이버=스토리형(1인칭 실장 언니 말투),
    구글=가이드형(비교표·체크리스트)** 으로 톤·구성·예시를 서로 다르게(같은 원고 복붙 금지).
  - **30대 여성 톤 이모지**, 가독성 위해 문단 짧게·적당히 띄어쓰기.
  - **본문 이미지 4장+**: 텍스트가 아니라 **사물·배경**(없으면 힉스필드 생성). `![](url)` 마크다운으로 삽입
    (네이버 다운로드 파싱·블로거 img 변환 모두 이 규격). **글마다 신규 이미지** — 재사용 금지.
  - **썸네일·본문에서 SEO/ISSUE 등 내부 지침 라벨 제거**. 대표이미지는 플랫폼 규격에 맞춤(네이버 피드=**정사각 1080**;
    세로 카드 이미지를 그대로 쓰면 사이즈 안 맞음).
  - **가짜 트렌드 패널 금지 → 실 검색량 데이터**: 네이버 데이터랩(PlayMCP `datalab_search`)으로 상대 검색관심도를
    받아 `keyword-trends.json`에 저장, `dashboard.ts`가 표로 렌더(네이버 불가 시 구글 트렌드 폴백).
    검색량 낮은 키워드가 드러나면 소재 우선순위 조정에 활용.
  - **키워드 기반 기획 시스템(권장·상위호환)**: 상대지수(데이터랩)보다 **실제 월간검색수**가 기획에 정확.
    `scripts/fetch-keywords.mjs`가 **네이버 검색광고 API `/keywordstool`**(HMAC 서명)로 시드 키워드의
    월간검색수(PC/모바일)·경쟁정도 + 검색량 상위 연관키워드(발굴)를 받아 `keyword-trends.json` **v2**로 저장.
    시크릿 `NAVER_AD_API_KEY`(액세스라이선스)·`NAVER_AD_SECRET`(비밀키)·`NAVER_AD_CUSTOMER_ID`(계정번호,
    검색광고>도구>API 사용 관리에서 발급). 대시보드 blogSection이 v2(월간검색수·경쟁·발굴후보)/v1(상대지수)
    자동 분기. 워크플로에 매 사이클 수집 스텝. **블로그 소재는 검색량 상위 키워드 우선으로 기획**.

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
  - 대시보드 **🧭 지침 탭**: 브랜드 노트(분석/방향성/감도) 3종 + 채널별 주제·핵심 가이드 작성 폼.
    이슈 제목 규약 `[브랜드노트·분석|방향성|감도]`, `[가이드·<채널key>]` (본문 `주제:` 줄 = 우선 소재 풀).
  - **guidance-sync.yml** (`on: issues`): 규약 이슈를 파싱해 `data/clients/<id>/brand-brief.json` +
    `channel-guides.json`에 반영 → 대시보드 재생성·커밋 → **이슈 자동 닫기(반영 완료 코멘트)** → Pages 배포.
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
  **정규식도 같은 함정**: 클라이언트 스크립트(plainHead 등)는 TS 템플릿리터럴로 emit되므로,
  브라우저에서 `*`를 지우려면 소스에 `/\\*/g`(백슬래시 2개)라고 써야 한다(→ 브라우저에 `/\*/g`로 풀림).
  소스에 `/\*/g`로 쓰면 브라우저엔 `/*/g`가 되어 "Invalid regular expression: missing /"로 화면이 깨진다.
  **대시보드 로직을 고치면 반드시 로컬에서 `dashboard --out`으로 생성 후 인라인 `<script>`를
  `vm.Script`로 파싱 검증**하고 배포할 것(브라우저에서만 터지는 오류를 CI가 못 잡는다).
- **대시보드 헤더 로고·타이틀은 제품 브랜드 "ALWAYS ON 콘텐츠 관제실"** (`dashboard.ts`의 `<title>`+`.brand`).
  업체 식별은 헤더 클라이언트 칩(`accounts`/client name)으로 표시되니 로고엔 업체명 대신 제품명을 쓴다.
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

- **개발환경은 외부 호스트 접근 불가**(cloudfront/외부 이미지 403). 미디어는 **세션에서 생성→URL 저장→
  CI에서 다운로드**. 이미지 다운로드·영상 합성은 네트워크 열린 CI(GitHub Actions)에서만.
- **한글은 HTML→Chromium**로 렌더. AI 확산 이미지에 한글 넣으면 깨진다.
- **헤드리스 크로미움은 하단 ~110px가 캡처에서 잘린다**(`--window-size` 높이 ≠ 실제 가용 높이). PNG 크기는
  지정대로(예 1080×1350) 나오지만, `bottom:`/`flex-end`로 맨 아래 붙인 텍스트가 화면 밖으로 밀려 안 보인다.
  **모든 하단 텍스트는 하단 세이프존(padding-bottom ≥135px) 안에** 두고, 인스타는 어차피 1:1 그리드가 상하
  135px를 크롭하니 그 밴드를 희생영역으로 설계한다(`render-cards.mjs`의 `--safe-b`, `render-ig.mjs`의 `SAFE_B`).
  상단(`top:`) 배치는 정상. 새 렌더러를 만들면 **더미 텍스트를 맨 아래에 찍어 잘리는지 먼저 테스트**할 것.
- **AI 이미지 최종 합성 검수는 개발환경에서 불가**(egress 정책이 `github.io`·`cloudfront`를 403 차단). 글자·레이아웃은
  dev 렌더(폴백 단색 배경)로 확인되지만 **실제 사진 합성 결과(얼굴 왜곡·구도)는 눈으로 못 본다**. 검수하려면
  ① 환경 네트워크 정책에 `*.cloudfront.net`·`cdn.higgsfield.ai`·`*.github.io`를 허용(설정은 **새 세션부터** 반영), 또는
  ② 담당자가 대시보드 캡처를 채팅에 올려주면 그 이미지를 열어 진단. 힉스필드 생성 프롬프트엔 항상
  `no text no letters`를 넣어 글자 아티팩트를 원천 차단.
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
