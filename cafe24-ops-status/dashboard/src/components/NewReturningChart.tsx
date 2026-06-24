import { useState } from "react";
import type { TrendRow } from "../types";
import { formatValue } from "../format";

// 신규 vs 재구매 매출 (일별, 영역) — 그리드 + 호버 툴팁
export function NewReturningChart({ rows }: { rows: TrendRow[] }) {
  const [idx, setIdx] = useState<number | null>(null);
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
  const grid = [0.25, 0.5, 0.75, 1];

  const area = (key: "new_sales" | "returning_sales") => {
    const pts = data.map((r, i) => `${x(i)},${y(r[key] ?? 0)}`);
    return `${pad.l},${pad.t + ih} ${pts.join(" ")} ${pad.l + iw},${pad.t + ih}`;
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    const step = data.length > 1 ? iw / (data.length - 1) : iw;
    let i = Math.round((xr - pad.l) / step);
    i = Math.max(0, Math.min(data.length - 1, i));
    setIdx(i);
  };

  return (
    <div className="card">
      <h2>신규 vs 재구매 매출 (일별)</h2>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="신규 vs 재구매 매출 추이"
          onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
          {grid.map((g) => (
            <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih - g * ih} y2={pad.t + ih - g * ih}
              stroke="#eef2f7" strokeWidth={1} />
          ))}
          <polygon points={area("returning_sales")} fill="#f59e0b" opacity={0.35} />
          <polygon points={area("new_sales")} fill="#3b82f6" opacity={0.4} />
          {idx !== null && (
            <line x1={x(idx)} x2={x(idx)} y1={pad.t} y2={pad.t + ih} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {data.map((r, i) => (
            <text key={r.date} x={x(i)} y={H - 6} className="axis" textAnchor="middle">{r.date.slice(8)}</text>
          ))}
        </svg>
        {idx !== null && (
          <div className="chart-tip" style={{ left: `${(x(idx) / W) * 100}%` }}>
            <div className="tip-date">{data[idx].date}</div>
            <div><i style={{ background: "#3b82f6" }} /> 신규 {formatValue(data[idx].new_sales ?? 0, "currency")}</div>
            <div><i style={{ background: "#f59e0b" }} /> 재구매 {formatValue(data[idx].returning_sales ?? 0, "currency")}</div>
          </div>
        )}
      </div>
      <div className="legend-inline">
        <span><i className="dot" style={{ background: "#3b82f6" }} /> 신규</span>
        <span><i className="dot" style={{ background: "#f59e0b" }} /> 재구매</span>
      </div>
    </div>
  );
}
