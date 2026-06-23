import { useEffect, useState } from "react";
import { api } from "./api";
import type {
  DailyRow,
  MetricsConfig,
  PeriodRow,
  SummaryCard,
} from "./types";
import { SummaryCards } from "./components/SummaryCards";
import { PeriodTable } from "./components/PeriodTable";
import { DailyTable } from "./components/DailyTable";
import { SalesChart } from "./components/SalesChart";
import { PlannedGroups } from "./components/PlannedGroups";

function daysBefore(date: string, n: number): string {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const [config, setConfig] = useState<MetricsConfig | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>("");
  const [cards, setCards] = useState<SummaryCard[]>([]);
  const [period, setPeriod] = useState<PeriodRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [error, setError] = useState<string>("");

  // 초기 로드: 설정 + 날짜 목록
  useEffect(() => {
    Promise.all([api.metricsConfig(), api.dates()])
      .then(([cfg, ds]) => {
        setConfig(cfg);
        setDates(ds.dates);
        setDate(ds.dates[ds.dates.length - 1] ?? "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  // 선택 날짜 변경 시 지표 로드
  useEffect(() => {
    if (!date) return;
    const from = daysBefore(date, 13);
    Promise.all([
      api.summary(date),
      api.periodComparison(date),
      api.daily(from, date),
    ])
      .then(([s, p, d]) => {
        setCards(s.cards);
        setPeriod(p.rows);
        setDaily(d.rows);
      })
      .catch((e) => setError(String(e)));
  }, [date]);

  if (error)
    return (
      <div className="app">
        <div className="card error">
          <b>API 연결 오류:</b> {error}
          <p className="muted">
            FastAPI 서버를 먼저 실행하세요: <code>uvicorn api.main:app --reload</code> 그리고{" "}
            <code>python scripts/run_all.py --days 14</code> 로 데이터를 적재하세요.
          </p>
        </div>
      </div>
    );

  if (!config) return <div className="app">불러오는 중…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>keek 운영 대시보드</h1>
          <span className="sub">
            카페24 어드민 · 데일리 수집 ({config.collection.granularity}, {config.collection.run_at})
          </span>
        </div>
        <div className="date-picker">
          <label>조회일</label>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </header>

      <SummaryCards cards={cards} />
      <PeriodTable rows={period} />
      <SalesChart rows={daily} />
      <DailyTable rows={daily} metrics={config.summary_cards} />
      <PlannedGroups config={config} />

      <footer className="foot">
        Phase 1 · 카페24 Admin API 연동 + React 어드민 대시보드 — 지표 정의는 metrics.yaml 기반
      </footer>
    </div>
  );
}
