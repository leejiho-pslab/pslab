import type { TrendRow } from "../types";

// 신규 vs 재구매 매출 (일별, 누적 영역)
export function NewReturningChart({ rows }: { rows: TrendRow[] }) {
  const data = rows.filter((r) => r.new_sales != null || r.returning_sales != null);
  if (data.length === 0)
    return (
      <div className="card">
        <h2>신규 vs 재구매 매출 (일별)</h2>
        <p className="muted">데이터 없음</p>
      </div>
    );

  const W = 760;
  const H = 220;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = Math.max(...data.flatMap((r) => [r.new_sales ?? 0, r.returning_sales ?? 0]), 1);
  const x = (i: number) => pad.l + (data.length === 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;

  const area = (key: "new_sales" | "returning_sales") => {
    const pts = data.map((r, i) => `${x(i)},${y(r[key] ?? 0)}`);
    return `${pad.l},${pad.t + ih} ${pts.join(" ")} ${pad.l + iw},${pad.t + ih}`;
  };

  return (
    <div className="card">
      <h2>신규 vs 재구매 매출 (일별)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        <polygon points={area("returning_sales")} fill="#f59e0b" opacity={0.35} />
        <polygon points={area("new_sales")} fill="#3b82f6" opacity={0.4} />
        {data.map((r, i) => (
          <text key={r.date} x={x(i)} y={H - 6} className="axis" textAnchor="middle">
            {r.date.slice(8)}
          </text>
        ))}
      </svg>
      <div className="legend-inline">
        <span><i className="dot" style={{ background: "#3b82f6" }} /> 신규</span>
        <span><i className="dot" style={{ background: "#f59e0b" }} /> 재구매</span>
      </div>
    </div>
  );
}
