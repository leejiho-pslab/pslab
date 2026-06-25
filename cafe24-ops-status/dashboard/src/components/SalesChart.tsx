import { useState } from "react";
import type { DailyRow } from "../types";
import { formatValue } from "../format";

// 일별 매출(막대) + 누적 매출(선) — 그리드라인 + 호버 툴팁
export function SalesChart({ rows }: { rows: DailyRow[] }) {
  const [idx, setIdx] = useState<number | null>(null);
  const series = rows
    .filter((r) => r.metric === "gross_sales")
    .sort((a, b) => a.date.localeCompare(b.date));

  if (series.length === 0)
    return (
      <div className="card">
        <h2>일별 매출 추이</h2>
        <p className="muted">데이터가 없습니다.</p>
      </div>
    );

  const W = 760;
  const H = 240;
  const pad = { l: 8, r: 8, t: 16, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxVal = Math.max(...series.map((s) => s.value), 1);

  let cum = 0;
  const cumVals = series.map((s) => (cum += s.value));
  const maxCum = Math.max(...cumVals, 1);

  const bw = iw / series.length;
  const x = (i: number) => pad.l + i * bw + bw * 0.15;
  const barW = bw * 0.7;
  const yBar = (v: number) => pad.t + ih - (v / maxVal) * ih;
  const yCum = (v: number) => pad.t + ih - (v / maxCum) * ih;
  const cumPath = cumVals.map((v, i) => `${x(i) + barW / 2},${yCum(v)}`).join(" ");
  const grid = [0.25, 0.5, 0.75, 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    let i = Math.round((xr - pad.l - barW / 2) / bw);
    i = Math.max(0, Math.min(series.length - 1, i));
    setIdx(i);
  };

  return (
    <div className="card">
      <h2>일별 매출 추이 (누적 매출 vs 목표)</h2>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
          onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
          {grid.map((g) => (
            <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih - g * ih} y2={pad.t + ih - g * ih}
              stroke="#eef2f7" strokeWidth={1} />
          ))}
          {series.map((s, i) => (
            <rect key={s.date} x={x(i)} y={yBar(s.value)} width={barW}
              height={pad.t + ih - yBar(s.value)} rx={3}
              fill="#3b82f6" opacity={idx === i ? 0.85 : 0.5} />
          ))}
          <polyline points={cumPath} fill="none" stroke="#0f172a" strokeWidth={2} />
          {idx !== null && (
            <line x1={x(idx) + barW / 2} x2={x(idx) + barW / 2} y1={pad.t} y2={pad.t + ih}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {series.map((s, i) => (
            <text key={s.date} x={x(i) + barW / 2} y={H - 8} className="axis" textAnchor="middle">
              {s.date.slice(8)}
            </text>
          ))}
        </svg>
        {idx !== null && (
          <div className="chart-tip" style={{ left: `${((x(idx) + barW / 2) / W) * 100}%` }}>
            <div className="tip-date">{series[idx].date}</div>
            <div><i style={{ background: "#3b82f6" }} /> 일 매출 {formatValue(series[idx].value, "currency")}</div>
            <div><i style={{ background: "#0f172a" }} /> 누적 {formatValue(cumVals[idx], "currency")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
