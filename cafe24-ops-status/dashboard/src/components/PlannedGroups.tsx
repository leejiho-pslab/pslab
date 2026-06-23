import type { MetricsConfig } from "../types";

// metrics.yaml 의 daily_table 그룹/차트 구성을 보여준다 (확장 예정 항목 포함).
export function PlannedGroups({ config }: { config: MetricsConfig }) {
  return (
    <div className="card">
      <h2>
        일별 운영 데이터 · 차트 구성 <span className="badge">metrics.yaml 정의</span>
      </h2>
      <p className="muted">
        아래 그룹/차트는 설정으로 정의되어 있으며, 데이터 연동(Phase 2~)에 따라 순차 채워집니다.
      </p>
      <div className="group-grid">
        {config.daily_groups.map((g) => (
          <div className="group-card" key={g.name}>
            <div className="group-title">{g.name}</div>
            <div className="chips">
              {(g.metrics ?? (g.top_n ? [`TOP ${g.top_n}`] : [])).map((m) => (
                <span className="chip" key={m}>
                  {m}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="chips chart-chips">
        {config.charts.map((c) => (
          <span className="chip chart" key={c.title}>
            {c.title}
          </span>
        ))}
      </div>
    </div>
  );
}
