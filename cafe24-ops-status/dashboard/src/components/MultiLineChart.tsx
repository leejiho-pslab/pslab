import { useState } from "react";

const COLORS = ["#3b82f6", "#f59e0b", "#16a34a", "#f43f5e", "#8b5cf6", "#0891b2"];

// 여러 시리즈의 라인 차트 (네이버 트렌드 등) — 그리드 + 호버 툴팁
export function MultiLineChart({
  title,
  series,
  rows,
}: {
  title: string;
  series: string[];
  rows: Array<Record<string, number | string>>;
}) {
  const [idx, setIdx] = useState<number | null>(null);
  if (rows.length === 0 || series.length === 0)
    return (
      <div className="card">
        <h2>{title}</h2>
        <p className="muted">데이터 없음</p>
      </div>
    );

  const W = 760;
  const H = 240;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const vals = rows.flatMap((r) => series.map((s) => Number(r[s]) || 0));
  const max = Math.max(...vals, 1);
  const x = (i: number) => pad.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const grid = [0.25, 0.5, 0.75, 1];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    const step = rows.length > 1 ? iw / (rows.length - 1) : iw;
    let i = Math.round((xr - pad.l) / step);
    i = Math.max(0, Math.min(rows.length - 1, i));
    setIdx(i);
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={title}
          onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
          {grid.map((g) => (
            <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih - g * ih} y2={pad.t + ih - g * ih}
              stroke="#eef2f7" strokeWidth={1} />
          ))}
          {series.map((s, si) => (
            <polyline key={s} points={rows.map((r, i) => `${x(i)},${y(Number(r[s]) || 0)}`).join(" ")}
              fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth={2} />
          ))}
          {idx !== null && (
            <line x1={x(idx)} x2={x(idx)} y1={pad.t} y2={pad.t + ih} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {rows.map((r, i) => (
            <text key={i} x={x(i)} y={H - 6} className="axis" textAnchor="middle">{String(r.date).slice(8)}</text>
          ))}
        </svg>
        {idx !== null && (
          <div className="chart-tip" style={{ left: `${(x(idx) / W) * 100}%` }}>
            <div className="tip-date">{String(rows[idx].date)}</div>
            {series.map((s, si) => (
              <div key={s}>
                <i style={{ background: COLORS[si % COLORS.length] }} /> {s} {Math.round(Number(rows[idx][s]) || 0).toLocaleString("ko-KR")}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="legend-inline">
        {series.map((s, si) => (
          <span key={s}><i className="dot" style={{ background: COLORS[si % COLORS.length] }} /> {s}</span>
        ))}
      </div>
    </div>
  );
}
