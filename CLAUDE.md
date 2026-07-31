# vittz-sns — 비츠(VITTZ) SNS 자동 운영 인스턴스

> 이 저장소는 `sns채널-자동화` 스킬의 **비츠 전용 인스턴스**(deployMode `dedicated`)다.
> 시스템 규약·엔진 지침의 단일 출처는 허브 저장소 `leejiho-pslab/pslab`의
> `.claude/skills/sns채널-자동화/`(SKILL.md + docs/ + adr/) — **여기에 규약을 복제하지 말 것.**

## 이 저장소만의 사실
- 클라이언트: `vittz` (`clients/vittz.json`) — 조명 기반 토탈 인테리어. 채널: 인스타·스레드·네이버블로그·유튜브·구글블로그 (링크드인 없음)
- 대시보드: https://leejiho-pslab.github.io/vittz-sns/ (Pages, `docs/index.html`)
- 담당자 연결 가이드: `data/clients/vittz/오픈-가이드.md`
- `data/`·`clients/*.json`은 gitignore — 새 파일은 `git add -f` 필요.

## 🚦 레퍼런스·지침 (구글 드라이브) — 기획·제작 전 필수 참조
- 소장님이 드라이브 `※alway on/2. 비츠/1. 레퍼런스 모음/{1. 인스타그램, 2. 유튜브, 3. 쓰레드, 4. 블로그}`에
  채널별 **레퍼런스와 지침**을 올린다. 폴더 ID는 `data/clients/vittz/design-reference.json`에 기록됨.
- **콘텐츠 기획·제작 전 반드시 해당 채널 폴더를 열람**하고, 새 지침·레퍼런스를
  `design-reference.json`(디자인 언어) · `channel-guides.json`/`brand-brief.json`/`design.json`
  `humanNotes`(지침) · `design-tokens.json`(렌더 값)으로 반영한 뒤 시작한다.
- 폴더가 비어 있으면 추측하지 말고 "대기"로 두고 업로드를 요청한다.
- 열람은 Claude 세션(Drive 연동)에서만 가능 — CI는 드라이브에 접근하지 못한다.

## 운영 원칙 (요약 — 상세는 허브 스킬)
- 콘텐츠 6대 지침(감도·화법 4종·사이트 이미지·목표·첫 장표 인터랙션·제품 이미지 50%↑)은
  `brand-brief.json`·`channel-guides.json`에 영구 반영돼 있다 — 지우지 말 것.
- 사이트 이미지는 `clients/vittz.json` `imageAllowlist` 도메인에서만 수급.
- 키워드 수치는 실측만(네이버 검색광고 API → `keyword-stats.json`) — 허수 금지.
- 카드 렌더는 CI(GitHub Actions)에서 — 로컬 렌더 커밋 금지.
