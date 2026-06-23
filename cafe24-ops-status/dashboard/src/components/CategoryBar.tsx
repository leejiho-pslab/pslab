import type { BreakdownItem } from "../types";
import { formatValue } from "../format";

type Unit = "currency" | "number" | "roas";

function fmt(v: number, unit: Unit): string {
  if (unit === "roas") return `${v.toFixed(2)}x`;
  if (unit === "number") return Math.round(v).toLocaleString("ko-KR");
  return formatValue(v, "currency");
}

export function CategoryBar({
  items,
  title,
  unit = "currency",
}: {
  items: BreakdownItem[];
  title: string;
  unit?: Unit;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="card">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <p className="muted">데이터 없음</p>
      ) : (
        <div className="hbars">
          {items.map((it) => (
            <div className="hbar-row" key={it.key}>
              <span className="hbar-label">{it.key}</span>
              <div className="hbar-track">
                <div className="hbar-fill" style={{ width: `${(it.value / max) * 100}%` }} />
              </div>
              <span className="hbar-val">{fmt(it.value, unit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
