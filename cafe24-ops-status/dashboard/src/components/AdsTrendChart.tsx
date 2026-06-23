import type { AdsTrendRow } from "../types";

// 일별 광고비(막대) + ROAS(선)
export function AdsTrendChart({ rows }: { rows: AdsTrendRow[] }) {
  if (rows.length === 0)
    return (
      <div className="card">
        <h2>일별 광고비 · ROAS 추이</h2>
        <p className="muted">데이터 없음</p>
      </div>
    );

  const W = 760;
  const H = 220;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxCost = Math.max(...rows.map((r) => r.ad_cost), 1);
  const maxRoas = Math.max(...rows.map((r) => r.roas ?? 0), 1);
  const bw = iw / rows.length;
  const bx = (i: number) => pad.l + i * bw + bw * 0.15;
  const barW = bw * 0.7;
  const yCost = (v: number) => pad.t + ih - (v / maxCost) * ih;
  const yRoas = (v: number) => pad.t + ih - (v / maxRoas) * ih;
  const line = rows.map((r, i) => `${bx(i) + barW / 2},${yRoas(r.roas ?? 0)}`).join(" ");

  return (
    <div className="card">
      <h2>일별 광고비 · ROAS 추이</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {rows.map((r, i) => (
          <rect key={r.date} x={bx(i)} y={yCost(r.ad_cost)} width={barW}
            height={pad.t + ih - yCost(r.ad_cost)} rx={3} fill="#f59e0b" opacity={0.55} />
        ))}
        <polyline points={line} fill="none" stroke="#16a34a" strokeWidth={2} />
        {rows.map((r, i) => (
          <text key={r.date} x={bx(i) + barW / 2} y={H - 6} className="axis" textAnchor="middle">
            {r.date.slice(8)}
          </text>
        ))}
      </svg>
      <div className="legend-inline">
        <span><i className="dot" style={{ background: "#f59e0b" }} /> 광고비</span>
        <span><i className="dot" style={{ background: "#16a34a" }} /> ROAS</span>
      </div>
    </div>
  );
}
