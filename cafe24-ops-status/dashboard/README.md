# dashboard (React) — Phase 1

React 웹 대시보드 자리. Phase 0 에서는 비워 두고, Phase 1 에서 다음을 구현한다.

- API(`/api/config/metrics`, `/api/summary`, `/api/daily`)를 호출해 화면 구성
- 카페24 어드민 대시보드부터: 상단 요약 KPI · 기간 비교 표 · 일별 운영 데이터 · 차트 5종
- 지표 정의는 서버의 `metrics.yaml` 을 그대로 받아 렌더링(= 설정만 바꾸면 화면도 바뀜)

설계 참고: `docs/afe24-ops-dashboard/diagrams/05_cafe24_dashboard_detail.png`
