# pslab-sns 운영 메모 (Claude 세션용)

## 관리 범위 (중요)
- **이 프로젝트(채팅)는 `_pslab` 클라이언트 전용 관리처** — 다른 업체(동성인쇄소, 비츠 등)는
  각자의 채팅/세션에서 관리한다. 이 세션에서 타 업체의 기획·발행·데이터를 수정하지 말 것.
- **대시보드는 업체별 분리(운영자 지시)** — 루트(`docs/index.html`)는 `--client pslab` 전용 관제실,
  타 업체는 `docs/<clientId>/index.html` 별도 URL. 전 업체를 한 화면에 합치지 말 것.
- 업체가 늘면 전용 저장소 분리(deployMode `dedicated`)가 권장 — 스킬 §0-1 참고.

## 브랜치
- 기본 브랜치 `claude/eager-lamport-mX0eT` (Pages 배포 환경이 이 브랜치로 제한됨), `main`은 동일하게 유지 — **항상 둘 다 푸시**.
- 나머지 브랜치들은 클라이언트별 분리(의도된 구조) — 병합 금지.

## 데이터
- `data/`와 `/clients/*.json`은 gitignore — 새 파일은 `git add -f` 필요.
- **⚠️ `data/`를 커밋하기 전에 반드시 `git fetch` + 병합할 것.** CI가 발행 결과를 이 폴더에
  계속 쓴다. 오래된 체크아웃을 그대로 커밋하면 CI가 기록한 `status: published`가 `planned`로
  되돌아가고, 다음 크론이 **같은 콘텐츠를 다시 발행**한다(2026-07-31 인스타·유튜브 중복 사고).
- 발행 중복 방지는 `published-ledger.json`(append-only)이 담당 — `plan.json` 상태가 되돌아가도
  재발행을 막고 상태를 자동 복구한다. 의도적 재발행은 원장에서 키를 지운 뒤 실행 (ADR-0017).
- 유튜브 성과는 실측만(플러그인이 Data API v3 statistics 조회). 가짜 지표 금지.
- 디자인: AI 학습 메모(`design.json notes`)와 운영자 지시(`humanNotes`)는 분리 — humanNotes는 사람 경로([디자인피드백] 이슈)로만 수정.
- 카드 색·레이아웃은 `data/clients/<id>/design-tokens.json` 우선.

## 레퍼런스·지침 (구글 드라이브) — 기획·제작 전 필수 참조
- 소장님이 드라이브 `※alway on/<n>. <업체>/1. 레퍼런스 모음/` 아래 **채널별 레퍼런스와 지침**을
  올린다(이 세션은 `1. pslab`). 폴더 ID는 `data/clients/pslab/design-reference.json`에 기록됨.
- 🚦 **콘텐츠 기획·제작 전 반드시 해당 채널 폴더를 열람**하고 새 파일을 반영한 뒤 시작한다
  (스킬 §0 변수 #11 · docs/02 "운영자 레퍼런스·지침 학습"이 단일 출처).
- **작업 순서**: Drive 열람(세션에서만 가능) → `design-reference.json`에 채널별 디자인 언어 기록 →
  지침 문서는 `channel-guides.json`/`brand-brief.json`/`design.json` `humanNotes`로 반영 →
  렌더에 물리는 값은 `design-tokens.json`(카드 `variants` / 릴스 `reels`)으로 반영 →
  힉스필드 장면 프롬프트에 문장으로 주입.
- 폴더가 비어 있으면 **추측해서 채우지 말고** 대기 상태 유지 + 업로드 요청.
- 드라이브가 재편성되어 기록된 folderId가 404면 루트(`※alway on`)부터 재검색해 ID를 갱신한다.

## ⚠️ 이미지 렌더는 CI에서만 (로컬 렌더 금지)
- 이 세션의 크로미움(141, new headless)은 `--window-size`에 창 크롬 ~85px를 포함해
  **뷰포트가 그만큼 짧게** 렌더된다. 결과 PNG는 요청 크기로 나오지만 **하단 ~85px가 흰 띠**로 채워진다.
  (카드 1080×1350, 블로그 커버 1600×900 모두 해당. `--headless=old`는 141에서 제거됨)
- CI(ubuntu-latest)에서는 정상 렌더된다 — **`render-cards.mjs` / `render-blog-images.mjs`는
  로컬에서 돌려 커밋하지 말 것.** 돌리면 커밋된 정상 카드까지 흰 띠 버전으로 덮어써진다.
- 신규 콘텐츠 이미지가 필요하면 기획·시드만 커밋하고 `pslab-cron` 워크플로를 트리거한다.
- 로컬에서 레이아웃만 확인하려면 렌더 후 **커밋하지 말고** `git checkout -- docs/cards docs/blog`로 되돌린다.

## 콘텐츠 규칙 (소장님 지시)
- 릴스/쇼츠 15초 이내, BGM·음성 없이(무음) — 추후 디벨롭 예정.
- 릴스 장면 클립 기본 모델: 힉스필드 **seedance_2_5** (소장님 지시, 2026-09-10까지 — 이후 재평가).
- **클립 비용 절감 3원칙 (소장님 지시 2026-08-08 — 무료 우선)**:
  ① 신규 릴스 기획 시 `clip-library.json`(재사용 라이브러리)에서 **장면 매칭을 먼저** 시도한다
     — 은유 컷(모래·책 쌓기·일출·박수 등)은 여러 릴스에 재사용 가능, 0크레딧.
  ② 웹 무료 생성 루프: MCP 는 무료 할당 미지원(실측 2026-08-08 — use_unlim 거절,
     unlim_trial_in_mcp_active false). 새 장면이 여러 개 필요하면 **프롬프트 시트를 만들어
     소장님께 전달** → 웹(무료 프로모)에서 생성 → "만들었어" 신호 → 세션이 show_generations 로
     계정 자산에서 URL 수거·연결한다. 크레딧 생성은 급한 1~2컷에만.
  ③ 새로 생성·수거한 클립은 반드시 clip-library.json 에 등록해 다음 기획에서 재사용한다.
  9:16 · 4초 · 720p · generate_audio:false. "33일 무료"는 웹 프로모로 MCP 청구에는 미적용(무음 4초 26크레딧) — 2026-08-08 실측.
- 장면은 자막 텍스트와 내용이 일치해야 함. 텍스트만 나오는 단순 영상 금지.
- 릴스 커버는 인터랙션 높은 프레임(thumb_offset, 기본 900ms) — 0초는 페이드인 검은 화면.
- 브랜드 키워드(pslab/문제해결연구소/alwayson/얼웨이즈온)는 모든 발행물에 상시 포함(cli의 안전망 있음).

## 외부 사이트 열람 (원격 세션)
- 네트워크 정책 '전체'(2026-07-30 변경) — 네이버·유튜브·인스타 접속 가능.
- **크로미움은 프록시와 TLS1.3 충돌** → `scripts/site-view.mjs` 사용(TLS1.2 강제 플래그 내장).
  - 페이지 확인: `node scripts/site-view.mjs shot <url> out.png`
  - 릴스 시청: `node scripts/site-view.mjs reel <릴스url> outdir` (mp4+프레임)
- 유튜브 영상 다운로드(yt-dlp)는 데이터센터 IP 봇체크로 실패 — 메타데이터·자막·댓글은 PlayMCP YouTubeData 도구로.
