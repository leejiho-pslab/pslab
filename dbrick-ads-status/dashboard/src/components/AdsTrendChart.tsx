import { useState } from "react";
import type { AdsTrendRow } from "../types";
import { formatValue } from "../format";

// 일별 광고비(막대) + ROAS(선) — 그리드라인 + 호버 툴팁
export function AdsTrendChart({
  rows,
  title = "일별 광고비 · ROAS 추이",
  height = 220,
}: {
  rows: AdsTrendRow[];
  title?: string;
  height?: number;
}) {
  const [idx, setIdx] = useState<number | null>(null);

  if (rows.length === 0)
    return (
      <div className="card">
        <h2>{title}</h2>
        <p className="muted">데이터 없음</p>
      </div>
    );

  const W = 760;
  const H = height;
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
  const grid = [0.25, 0.5, 0.75, 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    let i = Math.round((xr - pad.l - barW / 2) / bw);
    i = Math.max(0, Math.min(rows.length - 1, i));
    setIdx(i);
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
          onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
          {grid.map((g) => (
            <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih - g * ih} y2={pad.t + ih - g * ih}
              stroke="#eef2f7" strokeWidth={1} />
          ))}
          {rows.map((r, i) => (
            <rect key={r.date} x={bx(i)} y={yCost(r.ad_cost)} width={barW}
              height={pad.t + ih - yCost(r.ad_cost)} rx={3}
              fill="#f59e0b" opacity={idx === i ? 0.85 : 0.5} />
          ))}
          <polyline points={line} fill="none" stroke="#16a34a" strokeWidth={2} />
          {idx !== null && (
            <line x1={bx(idx) + barW / 2} x2={bx(idx) + barW / 2} y1={pad.t} y2={pad.t + ih}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {rows.map((r, i) => (
            <text key={r.date} x={bx(i) + barW / 2} y={H - 6} className="axis" textAnchor="middle">
              {r.date.slice(5)}
            </text>
          ))}
        </svg>
        {idx !== null && (
          <div className="chart-tip" style={{ left: `${((bx(idx) + barW / 2) / W) * 100}%` }}>
            <div className="tip-date">{rows[idx].date}</div>
            <div><i style={{ background: "#f59e0b" }} /> 광고비 {formatValue(rows[idx].ad_cost, "currency")}</div>
            <div><i style={{ background: "#16a34a" }} /> ROAS {rows[idx].roas ?? "—"}x</div>
          </div>
        )}
      </div>
      <div className="legend-inline">
        <span><i className="dot" style={{ background: "#f59e0b" }} /> 광고비</span>
        <span><i className="dot" style={{ background: "#16a34a" }} /> ROAS</span>
      </div>
    </div>
  );
}
