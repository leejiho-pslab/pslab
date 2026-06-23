import type { DailyRow, SummaryCard } from "../types";
import { formatByKey } from "../format";

// 일별 운영 데이터(요약 지표) — 날짜 × 지표 매트릭스. /api/daily 의 실데이터를 사용.
export function DailyTable({
  rows,
  metrics,
}: {
  rows: DailyRow[];
  metrics: SummaryCard[];
}) {
  const dates = Array.from(new Set(rows.map((r) => r.date))).sort();
  const byKey = new Map<string, number>();
  for (const r of rows) byKey.set(`${r.date}|${r.metric}`, r.value);

  return (
    <div className="card">
      <h2>일별 운영 데이터 (요약 지표)</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="left">지표</th>
              {dates.map((d) => (
                <th key={d}>{d.slice(5)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <tr key={m.key}>
                <td className="left strong">{m.label}</td>
                {dates.map((d) => (
                  <td key={d}>{formatByKey(byKey.get(`${d}|${m.key}`) ?? null, m.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
