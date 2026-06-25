# pslab

이 저장소는 두 개의 독립 프로젝트를 포함합니다(모노레포).

## 1) pslab-sns — SNS 자동화 (루트)
플러그인 기반 **SNS 자동화** 도구. 하나의 콘텐츠를 여러 SNS 채널에 **생성 → 동시 발행 →
예약 → 성과 분석**까지 자동화합니다.

- **대상 플랫폼**: YouTube · 네이버 블로그 · Instagram · Threads · LinkedIn
- **스택**: Node.js 20+ / TypeScript (ESM)
- 빠른 시작:
  ```bash
  npm install
  cp .env.example .env     # 자격 증명 입력 (없어도 데모는 동작)
  npm run demo             # 종단 간 데모 (연결→생성→발행→예약→리포트)
  ```

## 2) cafe24-ops-status — 자사몰 통합 자동화 운영현황 대시보드
카페24 자사몰 운영을 위한 **통합 자동화 대시보드**. 데이터를 데일리로 무인 수집하여
4대 대시보드(카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링)를 채운다.

- **구현체**: [`cafe24-ops-status/`](cafe24-ops-status/) — Python 스킬 + FastAPI + React
- **설계 도면**: [`docs/afe24-ops-dashboard/`](docs/afe24-ops-dashboard/)
- **무인 수집(GitHub Actions)**: [`cafe24-ops-status/GITHUB-ACTIONS.md`](cafe24-ops-status/GITHUB-ACTIONS.md)
- 빠른 시작:
  ```bash
  cd cafe24-ops-status
  docker compose up --build        # → http://localhost:8000 (mock 30일 자동 적재)
  ```
