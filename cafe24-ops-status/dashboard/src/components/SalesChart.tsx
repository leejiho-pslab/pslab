import type { DailyRow } from "../types";

// 일별 매출 추이 (막대) + 누적 매출 (선) — 의존성 없이 SVG 로 직접 그린다.
export function SalesChart({ rows }: { rows: DailyRow[] }) {
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

  const cumPath = cumVals
    .map((v, i) => `${x(i) + barW / 2},${yCum(v)}`)
    .join(" ");

  return (
    <div className="card">
      <h2>일별 매출 추이 (누적 매출 vs 목표)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {series.map((s, i) => (
          <rect
            key={s.date}
            x={x(i)}
            y={yBar(s.value)}
            width={barW}
            height={pad.t + ih - yBar(s.value)}
            rx={3}
            fill="#3b82f6"
            opacity={0.55}
          />
        ))}
        <polyline points={cumPath} fill="none" stroke="#0f172a" strokeWidth={2} />
        {cumVals.map((v, i) => (
          <circle key={i} cx={x(i) + barW / 2} cy={yCum(v)} r={2.5} fill="#0f172a" />
        ))}
        {series.map((s, i) => (
          <text key={s.date} x={x(i) + barW / 2} y={H - 8} className="axis" textAnchor="middle">
            {s.date.slice(8)}
          </text>
        ))}
      </svg>
    </div>
  );
}
