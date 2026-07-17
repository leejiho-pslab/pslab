# 비츠(VITTZ) SNS 채널 자동 운영

조명 기반 토탈 인테리어 플랫폼 **비츠(vittz.co.kr)** 의 SNS를 24시간 무인 운영하는 시스템.
pslab SNS 자동화 시스템의 독립 배포본으로, **이 저장소에는 비츠 데이터만** 있습니다.

- 🖥️ **콘텐츠 관제실(대시보드)**: https://leejiho-pslab.github.io/vittz-sns/
- 📚 조사 자료집: [`data/clients/vittz/research/`](data/clients/vittz/research/) (브랜드·시장·키워드·채널 전략 01~08)
- 🧾 담당자 오픈 가이드: [`data/clients/vittz/오픈-가이드.md`](data/clients/vittz/오픈-가이드.md)

## 현재 상태

| 단계 | 상태 |
|---|---|
| ① 브랜드 학습 | ✅ 완료 (대시보드 📚 리서치 탭) |
| ② 대시보드 오픈 | ✅ 완료 (콘텐츠 미생성 · 실발행 OFF = 안전 시뮬레이션) |
| ③ 콘텐츠 감도조율 | ⬜ 예정 (카드/커버 시안 → 담당자 확인) |
| ④ 키워드 도구 조회 | ⬜ 예정 (배치표는 리서치 탭 🔑 항목) |
| ⑤ 계정 연결·실발행 ON | ⬜ 맨 마지막 (오픈-가이드.md 참고) |

## 채널

인스타그램 `@vittz_official` · 스레드 `@vittz_official` · 네이버 블로그 `vittzlighting`(수동 복붙) ·
유튜브 `UCqfOTULeIeIurfRY-DXEoyw` · 구글 블로그(선택) · 링크드인(선택)

## 구조

- `clients/vittz.json` — 업체 설정표 (테마·계정·발행 시각·콘텐츠 필러)
- `data/clients/vittz/` — 브랜드 노트·채널 가이드·리서치·기획안(추후)
- `src/`, `scripts/` — 생성·렌더·발행 엔진 (pslab 시스템과 동일 코드베이스)
- `.github/workflows/` — `vittz-cron.yml`(무인 루프) · `vittz-publish.yml`(수동 발행) ·
  `guidance-sync.yml`(지침 반영) · `pages-deploy.yml`(대시보드 배포)

## 운영 메모

- 무료 플랜 Pages는 **public 저장소**에서만 동작 (시크릿은 public이어도 노출되지 않음)
- Settings → Pages → Source가 **GitHub Actions**인지 확인
- 채널 토큰은 Settings → Secrets and variables → Actions 에만 등록 (이름은 오픈-가이드.md)
- 실발행 스위치: Variables `PSLAB_DRY_RUN=false`
