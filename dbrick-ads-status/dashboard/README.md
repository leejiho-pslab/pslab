# dashboard (React) — 카페24 어드민 대시보드

Vite + React + TypeScript. 의존성 최소화(차트는 인라인 SVG, 외부 차트 라이브러리 없음).
FastAPI(`api/main.py`)가 내려주는 지표를 그대로 렌더링한다 — 지표 정의(`metrics.yaml`)를
바꾸면 화면도 따라 바뀐다.

## 실행

```bash
# 1) 백엔드 (데이터 적재 + API)
cd ..                       # cafe24-ops-status/
python scripts/run_all.py --days 14
uvicorn api.main:app --reload     # http://localhost:8000

# 2) 프론트엔드
cd dashboard
npm install
npm run dev                 # http://localhost:5173 (/api 는 8000 으로 프록시)
npm run build               # 타입체크 + 프로덕션 빌드
```

API 베이스를 바꾸려면 `.env` 에 `VITE_API_BASE=http://host:port` 설정.

## 화면 구성

- **상단 요약 KPI** — `/api/summary` (매출·광고매출·주문건수·객단가·전환율·광고비율)
- **핵심 지표 기간 비교** — `/api/period-comparison` (최근7일/직전7일/당월/전월동기/전년동기 + 증감)
- **일별 매출 추이** — `/api/daily` (막대=일 매출, 선=누적, SVG)
- **일별 운영 데이터(요약 지표)** — `/api/daily` 매트릭스
- **일별 운영 데이터·차트 구성** — `/api/config/metrics` 의 그룹/차트 정의(확장 예정 표시)

설계 참고: `docs/afe24-ops-dashboard/diagrams/05_cafe24_dashboard_detail.png`
