const COLORS = ["#3b82f6", "#f59e0b", "#16a34a", "#f43f5e", "#8b5cf6", "#0891b2"];

// 여러 시리즈의 라인 차트 (네이버 트렌드 등)
export function MultiLineChart({
  title,
  series,
  rows,
}: {
  title: string;
  series: string[];
  rows: Array<Record<string, number | string>>;
}) {
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

  return (
    <div className="card">
      <h2>{title}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        {series.map((s, si) => (
          <polyline
            key={s}
            points={rows.map((r, i) => `${x(i)},${y(Number(r[s]) || 0)}`).join(" ")}
            fill="none"
            stroke={COLORS[si % COLORS.length]}
            strokeWidth={2}
          />
        ))}
        {rows.map((r, i) => (
          <text key={i} x={x(i)} y={H - 6} className="axis" textAnchor="middle">
            {String(r.date).slice(8)}
          </text>
        ))}
      </svg>
      <div className="legend-inline">
        {series.map((s, si) => (
          <span key={s}>
            <i className="dot" style={{ background: COLORS[si % COLORS.length] }} /> {s}
          </span>
        ))}
      </div>
    </div>
  );
}
