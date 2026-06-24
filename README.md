# pslab — 자사몰 통합 자동화 운영현황 대시보드 (카페24)

카페24 자사몰 운영을 위한 **통합 자동화 대시보드**. 데이터를 데일리로 무인 수집하여
4대 대시보드(카페24 어드민 / 광고 / 광고 히스토리 / 경쟁사 모니터링)를 채운다.

- **구현체**: [`cafe24-ops-status/`](cafe24-ops-status/) — Claude Code 스킬(Python) + FastAPI + React
- **설계 도면**: [`docs/afe24-ops-dashboard/`](docs/afe24-ops-dashboard/) — 아키텍처/대시보드/로드맵 이미지

## 빠른 시작

### Docker (단일 서비스 — API + 대시보드 한 번에)

```bash
cd cafe24-ops-status
docker compose up --build        # → http://localhost:8000  (mock 30일 자동 적재)
```

### 로컬 개발 (핫리로드)

```bash
cd cafe24-ops-status
pip install -r requirements.txt
./scripts/dev.sh                 # API :8000 + 대시보드 :5173
```

### 카페24 실데이터(live)

`config/secrets.env` 에 자격증명을 채우고:

```bash
python scripts/smoke_live.py --check          # 연결 점검
python scripts/run_all.py --mode live         # 1일 실수집
```

자세한 절차는 [`cafe24-ops-status/SMOKE.md`](cafe24-ops-status/SMOKE.md).

## 구성

| 구성요소 | 설명 |
|---------|------|
| 수집 스킬 (Python) | 소스별 collector(카페24/광고/소재/경쟁사) + ETL + 데일리 스케줄러 |
| 저장소 | SQLite(정규화 facts + 집계 KPI) + raw 스냅샷 |
| API (FastAPI) | 대시보드용 읽기 엔드포인트 + 빌드된 대시보드 정적 서빙 |
| 대시보드 (React) | 4탭 — 지표 정의는 `config/metrics.yaml` 기반 |
| 자동화 | GitHub Actions 데일리 워크플로 + 알림(이상치/Top소재/경쟁사) |

## 상태

4대 대시보드 + 자동화 골격 완성. 데이터는 `mock`(결정적 샘플)이 기본이며, 카페24는 `--mode live`
로 실수집 가능. 광고/소재/경쟁사/네이버의 외부 소스 live 연동은 각 collector 의 `collect_live` 에 채운다.
