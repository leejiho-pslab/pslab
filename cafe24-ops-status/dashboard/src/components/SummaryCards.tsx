import type { SummaryCard } from "../types";
import { formatValue } from "../format";

export function SummaryCards({ cards }: { cards: SummaryCard[] }) {
  return (
    <div className="kpi-grid">
      {cards.map((c) => (
        <div className="kpi-card" key={c.key}>
          <div className="kpi-label">{c.label}</div>
          <div className="kpi-value">{formatValue(c.value, c.format)}</div>
        </div>
      ))}
    </div>
  );
}
