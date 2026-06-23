import type { PeriodRow } from "../types";
import { formatByKey, formatDelta } from "../format";

const WINDOWS: { key: string; label: string }[] = [
  { key: "recent_7d", label: "최근 7일" },
  { key: "prev_7d", label: "직전 7일" },
  { key: "month_to_date", label: "당월 누적" },
  { key: "prev_month_same", label: "전월 동기" },
  { key: "prev_year_same", label: "전년 동기" },
];

export function PeriodTable({ rows }: { rows: PeriodRow[] }) {
  return (
    <div className="card">
      <h2>핵심 지표 기간 비교</h2>
      <div className="table-wrap">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="left">지표</th>
              {WINDOWS.map((w) => (
                <th key={w.key}>{w.label}</th>
              ))}
              <th>증감 (최근/직전)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = formatDelta(r.delta_recent_vs_prev);
              return (
                <tr key={r.key}>
                  <td className="left strong">{r.label}</td>
                  {WINDOWS.map((w) => (
                    <td key={w.key}>{formatByKey(r.values[w.key], r.key)}</td>
                  ))}
                  <td className={`delta ${d.cls}`}>{d.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
