import { useEffect, useState } from "react";
import { api } from "../api";
import type { VisitorTrendRow } from "../types";

// 일별 방문자 추이 — 신규/재방문 누적 막대 + 전체방문 라인. 호버 툴팁.
export function VisitorChart({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<VisitorTrendRow[] | null>(null);
  const [idx, setIdx] = useState<number | null>(null);

  useEffect(() => {
    setRows(null);
    api.visitorTrend(from, to).then((r) => setRows(r.rows)).catch(() => setRows([]));
  }, [from, to]);

  if (!rows)
    return (
      <div className="card">
        <h2>방문자 추이</h2>
        <p className="muted">불러오는 중…</p>
      </div>
    );
  const series = rows.filter((r) => (r.visitors ?? 0) > 0 || (r.new ?? 0) + (r.returning ?? 0) > 0);
  if (series.length === 0)
    return (
      <div className="card">
        <h2>방문자 추이</h2>
        <p className="muted">해당 기간 방문자 데이터가 없습니다.</p>
      </div>
    );

  const W = 900;
  const H = 260;
  const pad = { l: 8, r: 8, t: 16, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxV = Math.max(...series.map((s) => Math.max(s.visitors ?? 0, (s.new ?? 0) + (s.returning ?? 0))), 1);
  const bw = iw / series.length;
  const x = (i: number) => pad.l + i * bw + bw * 0.15;
  const barW = bw * 0.7;
  const y = (v: number) => pad.t + ih - (v / maxV) * ih;
  const totalPts = series.map((s, i) => `${x(i) + barW / 2},${y(s.visitors ?? 0)}`).join(" ");
  const grid = [0.25, 0.5, 0.75, 1];
  const hasSeg = series.some((s) => (s.new ?? 0) + (s.returning ?? 0) > 0);

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    let i = Math.round((xr - pad.l - barW / 2) / bw);
    i = Math.max(0, Math.min(series.length - 1, i));
    setIdx(i);
  };
  const tick = Math.max(1, Math.ceil(series.length / 15));

  return (
    <div className="card">
      <div className="card-head">
        <h2>방문자 추이</h2>
        <span className="muted">{series[0].date} ~ {series[series.length - 1].date}</span>
      </div>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img"
          onMouseMove={onMove} onMouseLeave={() => setIdx(null)}>
          {grid.map((g) => (
            <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + ih - g * ih} y2={pad.t + ih - g * ih}
              stroke="#eef2f7" strokeWidth={1} />
          ))}
          {series.map((s, i) => {
            const nv = s.new ?? 0;
            const rv = s.returning ?? 0;
            const seg = nv + rv;
            if (seg <= 0) return null;
            const hNew = (nv / maxV) * ih;
            const hRet = (rv / maxV) * ih;
            const yRet = pad.t + ih - hRet;
            const yNew = yRet - hNew;
            return (
              <g key={s.date} opacity={idx === i ? 1 : 0.85}>
                <rect x={x(i)} y={yRet} width={barW} height={hRet} fill="#f59e0b" rx={2} />
                <rect x={x(i)} y={yNew} width={barW} height={hNew} fill="#3b82f6" rx={2} />
              </g>
            );
          })}
          {/* 세그먼트 데이터 없으면 전체방문을 옅은 막대로 */}
          {!hasSeg && series.map((s, i) => (
            <rect key={s.date} x={x(i)} y={y(s.visitors ?? 0)} width={barW}
              height={pad.t + ih - y(s.visitors ?? 0)} fill="#93c5fd" rx={2}
              opacity={idx === i ? 1 : 0.7} />
          ))}
          <polyline points={totalPts} fill="none" stroke="#0f172a" strokeWidth={2} />
          {idx !== null && (
            <line x1={x(idx) + barW / 2} x2={x(idx) + barW / 2} y1={pad.t} y2={pad.t + ih}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {series.map((s, i) =>
            i % tick === 0 ? (
              <text key={s.date} x={x(i) + barW / 2} y={H - 8} className="axis" textAnchor="middle">
                {s.date.slice(5)}
              </text>
            ) : null
          )}
        </svg>
        {idx !== null && (
          <div className="chart-tip" style={{ left: `${((x(idx) + barW / 2) / W) * 100}%` }}>
            <div className="tip-date">{series[idx].date}</div>
            <div><i style={{ background: "#0f172a" }} /> 전체 {(series[idx].visitors ?? 0).toLocaleString("ko-KR")}</div>
            {hasSeg && (
              <>
                <div><i style={{ background: "#3b82f6" }} /> 신규 {(series[idx].new ?? 0).toLocaleString("ko-KR")}</div>
                <div><i style={{ background: "#f59e0b" }} /> 재방문 {(series[idx].returning ?? 0).toLocaleString("ko-KR")}</div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="chart-legend">
        <span><i style={{ background: "#0f172a" }} /> 전체방문</span>
        {hasSeg && <span><i style={{ background: "#3b82f6" }} /> 신규방문</span>}
        {hasSeg && <span><i style={{ background: "#f59e0b" }} /> 재방문</span>}
      </div>
    </div>
  );
}
