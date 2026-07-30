# ADR-0011: 레퍼런스·벤치마킹 수집은 인스타 Business Discovery로

- **상태**: 채택됨 (수집 파이프라인 구현 완료 · 토큰 스코프 실검증 진행 중)
- **날짜**: 2026-07-16
- **관련 SKILL**: docs/03-기획-지능.md · docs/06-대시보드.md
- **관련 ADR**: —

## 맥락 (Context)
기획·감도를 높이려면 경쟁·레퍼런스 계정의 실제 콘텐츠를 대시보드에 모아 참고하고 싶었다. 그러나
인스타그램은 **남의 계정 콘텐츠를 여는 공개 API가 사실상 없다.** 개발환경에는 인스타 열람 도구도
없고, WebFetch도 로그인·JS 벽으로 이미지를 못 가져온다.

## 결정 (Decision)
인스타 Graph API의 **`business_discovery`**로 수집한다. **우리 기존 발행 토큰을 재사용**
(`PSLAB_INSTAGRAM_ACCESS_TOKEN`/`PSLAB_INSTAGRAM_IG_USER_ID`)해 대상 계정의 최근 게시물
(이미지·캡션·좋아요/댓글)을 받는다. 대상은 `clients/<id>.json`의 `benchmarks.instagram`(단일 출처),
수집은 `scripts/fetch-references.mjs`가 이미지까지 `docs/references/<id>/`로 다운로드해
`references.json`에 저장(매주 월요일 CI). 수집물은 **내부 벤치마킹·감도 참고 전용**(재게시 금지).

## 고려한 대안 (Options)
- **A안(채택) — Business Discovery(발행 토큰 재사용)**: 정식·합법 경로, 추가 발급 최소.
  단점: **공개 비즈니스/크리에이터 계정만** 조회 가능(개인·비공개 스킵), 토큰에 `instagram_basic` 스코프 필요.
- **B안 — 수동 큐레이션**: 담당자가 URL/스크린샷 제공 → 저장·표시. 세팅 0. 단점: 무인 자동화 아님.
- **C안 — 서드파티 스크래핑(Apify 등)**: 임의 계정 수집. 단점: ToS 위반·비용·불안정 → 배제.

## 결과 (Consequences)
- (+) 무료·무인으로 경쟁/감도 레퍼런스가 대시보드에 쌓인다. 이미지는 `docs/`→github.io 배포라
  별도 CDN allowlist가 필요 없다(우리 콘텐츠와 동일 경로).
- (−) **공개 비즈니스 계정만** 수집됨 — 개인 계정 벤치는 API로 안 잡혀 수동 보완이 필요.
- (−) ⚠ **스코프 함정**: `business_discovery`는 토큰에 `instagram_basic`이 있어야 한다. 발행 권한만으론
  부족할 수 있어 **수집 0건이면 토큰 스코프부터 의심**(Graph API 탐색기에서 추가 재발급). 조회 계정도
  비즈니스 계정 + 페이스북 페이지 연결 필수.

## 관련 파일
`scripts/fetch-references.mjs`, `clients/<id>.json`(benchmarks), `data/clients/<id>/references.json`,
`docs/references/<id>/`, `.github/workflows/pslab-cron.yml`(월요일 수집 스텝)
