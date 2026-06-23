import type { BreakdownItem } from "../types";
import { formatValue } from "../format";

const COLORS: Record<string, string> = { mobile: "#3b82f6", pc: "#f59e0b" };
const LABEL: Record<string, string> = { mobile: "모바일", pc: "PC" };

export function DeviceDonut({ items }: { items: BreakdownItem[] }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const R = 60;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div className="card">
      <h2>디바이스별 매출 비중</h2>
      {items.length === 0 ? (
        <p className="muted">데이터 없음</p>
      ) : (
        <div className="donut-wrap">
          <svg viewBox="0 0 160 160" className="donut">
            <g transform="rotate(-90 80 80)">
              {items.map((it) => {
                const frac = it.value / total;
                const dash = `${frac * C} ${C}`;
                const seg = (
                  <circle
                    key={it.key}
                    cx={80}
                    cy={80}
                    r={R}
                    fill="none"
                    stroke={COLORS[it.key] ?? "#94a3b8"}
                    strokeWidth={22}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset * C}
                  />
                );
                offset += frac;
                return seg;
              })}
            </g>
          </svg>
          <ul className="legend">
            {items.map((it) => (
              <li key={it.key}>
                <span className="dot" style={{ background: COLORS[it.key] ?? "#94a3b8" }} />
                {LABEL[it.key] ?? it.key}
                <b>{((it.value / total) * 100).toFixed(1)}%</b>
                <span className="muted">{formatValue(it.value, "currency")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
