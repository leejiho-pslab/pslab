# pslab-sns 운영 메모 (Claude 세션용)

## 브랜치
- 기본 브랜치 `claude/eager-lamport-mX0eT` (Pages 배포 환경이 이 브랜치로 제한됨), `main`은 동일하게 유지 — **항상 둘 다 푸시**.
- 나머지 브랜치들은 클라이언트별 분리(의도된 구조) — 병합 금지.

## 데이터
- `data/`와 `/clients/*.json`은 gitignore — 새 파일은 `git add -f` 필요.
- 유튜브 성과는 실측만(플러그인이 Data API v3 statistics 조회). 가짜 지표 금지.
- 디자인: AI 학습 메모(`design.json notes`)와 운영자 지시(`humanNotes`)는 분리 — humanNotes는 사람 경로([디자인피드백] 이슈)로만 수정.
- 카드 색·레이아웃은 `data/clients/<id>/design-tokens.json` 우선.

## 콘텐츠 규칙 (소장님 지시)
- 릴스/쇼츠 15초 이내, BGM·음성 없이(무음) — 추후 디벨롭 예정.
- 장면은 자막 텍스트와 내용이 일치해야 함. 텍스트만 나오는 단순 영상 금지.
- 릴스 커버는 인터랙션 높은 프레임(thumb_offset, 기본 900ms) — 0초는 페이드인 검은 화면.
- 브랜드 키워드(pslab/문제해결연구소/alwayson/얼웨이즈온)는 모든 발행물에 상시 포함(cli의 안전망 있음).

## 외부 사이트 열람 (원격 세션)
- 네트워크 정책 '전체'(2026-07-30 변경) — 네이버·유튜브·인스타 접속 가능.
- **크로미움은 프록시와 TLS1.3 충돌** → `scripts/site-view.mjs` 사용(TLS1.2 강제 플래그 내장).
  - 페이지 확인: `node scripts/site-view.mjs shot <url> out.png`
  - 릴스 시청: `node scripts/site-view.mjs reel <릴스url> outdir` (mp4+프레임)
- 유튜브 영상 다운로드(yt-dlp)는 데이터센터 IP 봇체크로 실패 — 메타데이터·자막·댓글은 PlayMCP YouTubeData 도구로.
