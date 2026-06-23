import { formatDelta } from "../format";

// 값 + 비교기간 대비 증감률
export function KpiDelta({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number | null | undefined;
}) {
  const d = formatDelta(delta ?? null);
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className={`kpi-delta ${d.cls}`}>{d.text}</div>
    </div>
  );
}
