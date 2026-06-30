import { useEffect, useState } from "react";
import { api } from "./api";
import type { MetricsConfig } from "./types";
import { BriefingBanner } from "./components/BriefingBanner";
import { Cafe24Page } from "./pages/Cafe24Page";
import { AdsPage } from "./pages/AdsPage";
import { CreativePage } from "./pages/CreativePage";
import { CompetitorPage } from "./pages/CompetitorPage";

const TABS = [
  { id: "cafe24", label: "카페24 어드민" },
  { id: "ads", label: "광고" },
  { id: "creative", label: "광고 히스토리" },
  { id: "competitor", label: "경쟁사 모니터링" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [config, setConfig] = useState<MetricsConfig | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>("");
  const [tab, setTab] = useState<TabId>("cafe24");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    Promise.all([api.metricsConfig(), api.dates()])
      .then(([cfg, ds]) => {
        setConfig(cfg);
        setDates(ds.dates);
        setDate(ds.dates[ds.dates.length - 1] ?? "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error)
    return (
      <div className="app">
        <div className="card error">
          <b>API 연결 오류:</b> {error}
          <p className="muted">
            백엔드를 먼저 실행하세요: <code>python scripts/run_all.py --days 14</code> 후{" "}
            <code>uvicorn api.main:app --reload</code>
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
            자사몰 통합 자동화 · 데일리 수집 ({config.collection.granularity}, {config.collection.run_at})
          </span>
        </div>
        <div className="date-picker">
          <label>조회일</label>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="대시보드 탭">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            aria-current={tab === t.id ? "page" : undefined}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <BriefingBanner date={date} />

      {tab === "cafe24" && <Cafe24Page date={date} config={config} />}
      {tab === "ads" && <AdsPage date={date} />}
      {tab === "creative" && <CreativePage date={date} />}
      {tab === "competitor" && <CompetitorPage date={date} />}

      <footer className="foot">
        자사몰 통합 자동화 대시보드 · 지표 정의는 metrics.yaml 기반 · 데이터 mock/live 전환 가능
      </footer>
    </div>
  );
}
