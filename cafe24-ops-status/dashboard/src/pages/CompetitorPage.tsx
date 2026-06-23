import { useEffect, useState } from "react";
import { api } from "../api";
import { daysBefore } from "../util";
import type { Competitor, CompetitorTrendRow } from "../types";

export function CompetitorPage({ date }: { date: string }) {
  const [comps, setComps] = useState<Competitor[]>([]);
  const [trend, setTrend] = useState<CompetitorTrendRow[]>([]);

  useEffect(() => {
    if (!date) return;
    api.competitors(date).then((r) => setComps(r.competitors));
    api.competitorsTrend(daysBefore(date, 13), date).then((r) => setTrend(r.rows));
  }, [date]);

  return (
    <>
      <div className="comp-grid">
        {comps.map((c) => (
          <div className="card comp-card" key={c.name}>
            <div className="comp-head">
              <h2>{c.name}</h2>
              <span className="rating">★ {c.avg_rating ?? "—"}</span>
            </div>
            <div className="comp-stats">
              <div><span>프로모션</span><b>{c.active_promotions ?? 0}</b></div>
              <div><span>노출 광고</span><b>{c.ad_count ?? 0}</b></div>
              <div><span>신규 후기</span><b>{c.new_reviews ?? 0}</b></div>
            </div>
            <div className="comp-best">
              <span className="muted">베스트 상품</span>
              <div className="chips">
                {c.best_products.map((p, i) => (
                  <span className="chip" key={p}>{i + 1}. {p}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <CompetitorTrend rows={trend} />
    </>
  );
}

// 경쟁사 전체 활동 추세 (신규 후기 / 프로모션)
function CompetitorTrend({ rows }: { rows: CompetitorTrendRow[] }) {
  if (rows.length === 0)
    return (
      <div className="card">
        <h2>경쟁사 활동 추세</h2>
        <p className="muted">데이터 없음</p>
      </div>
    );
  const W = 760;
  const H = 200;
  const pad = { l: 8, r: 8, t: 14, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxR = Math.max(...rows.map((r) => r.new_reviews), 1);
  const x = (i: number) => pad.l + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / maxR) * ih;
  const line = rows.map((r, i) => `${x(i)},${y(r.new_reviews)}`).join(" ");

  return (
    <div className="card">
      <h2>경쟁사 활동 추세 (전체 신규 후기)</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
        <polyline points={line} fill="none" stroke="#f43f5e" strokeWidth={2} />
        {rows.map((r, i) => (
          <circle key={r.date} cx={x(i)} cy={y(r.new_reviews)} r={2.5} fill="#f43f5e" />
        ))}
        {rows.map((r, i) => (
          <text key={r.date} x={x(i)} y={H - 6} className="axis" textAnchor="middle">
            {r.date.slice(8)}
          </text>
        ))}
      </svg>
    </div>
  );
}
