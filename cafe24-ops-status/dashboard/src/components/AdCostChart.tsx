import type { TrendRow } from "../types";

// 일별 광고비(막대) vs 매출대비 광고비율(선)
export function AdCostChart({ rows }: { rows: TrendRow[] }) {
  const data = rows.filter((r) => r.ad_cost != null);
  if (data.length === 0)
    return (
      <div className="card">
        <h2>일별 광고비 vs 매출대비 광고비율</h2>
        <p className="muted">데이터 없음</p>
      </div>
    );

  const W = 760;
  const H = 220;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxCost = Math.max(...data.map((r) => r.ad_cost ?? 0), 1);
  const maxRatio = Math.max(...data.map((r) => r.ad_cost_ratio ?? 0), 1);
  const bw = iw / data.length;
  const bx = (i: number) => pad.l + i * bw + bw * 0.15;
  const barW = bw * 0.7;
  const yCost = (v: number) => pad.t + ih - (v / maxCost) * ih;
  const yRatio = (v: number) => pad.t + ih - (v / maxRatio) * ih;
  const line = data.map((r, i) => `${bx(i) + barW / 2},${yRatio(r.ad_cost_ratio ?? 0)}`).join(" ");

  return (
    <div className="card">
      <h2>일별 광고비 vs 매출대비 광고비율</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {data.map((r, i) => (
          <rect
            key={r.date}
            x={bx(i)}
            y={yCost(r.ad_cost ?? 0)}
            width={barW}
            height={pad.t + ih - yCost(r.ad_cost ?? 0)}
            rx={3}
            fill="#f59e0b"
            opacity={0.55}
          />
        ))}
        <polyline points={line} fill="none" stroke="#dc2626" strokeWidth={2} />
        {data.map((r, i) => (
          <text key={r.date} x={bx(i) + barW / 2} y={H - 6} className="axis" textAnchor="middle">
            {r.date.slice(8)}
          </text>
        ))}
      </svg>
      <div className="legend-inline">
        <span><i className="dot" style={{ background: "#f59e0b" }} /> 광고비</span>
        <span><i className="dot" style={{ background: "#dc2626" }} /> 매출대비 광고비율</span>
      </div>
    </div>
  );
}
