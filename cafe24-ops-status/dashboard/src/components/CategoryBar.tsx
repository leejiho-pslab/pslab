import type { BreakdownItem } from "../types";
import { formatValue } from "../format";

export function CategoryBar({ items, title }: { items: BreakdownItem[]; title: string }) {
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
              <span className="hbar-val">{formatValue(it.value, "currency")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
