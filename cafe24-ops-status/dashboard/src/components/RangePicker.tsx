import { useState } from "react";
import { daysBefore } from "../util";

const PRESETS: [string, string, number][] = [
  ["7d", "최근 7일", 6],
  ["14d", "최근 14일", 13],
  ["30d", "최근 30일", 29],
];

// 단일 기간 선택 (소재/경쟁사 등 비교가 필요 없는 영역용)
export function RangePicker({
  base,
  from,
  to,
  onChange,
}: {
  base: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [pid, setPid] = useState("7d");
  return (
    <div className="card period-selector">
      <div className="preset-row">
        {PRESETS.map(([id, label, days]) => (
          <button
            key={id}
            className={pid === id ? "active" : ""}
            onClick={() => {
              setPid(id);
              onChange(daysBefore(base, days), base);
            }}
          >
            {label}
          </button>
        ))}
        <button className={pid === "custom" ? "active" : ""} onClick={() => setPid("custom")}>
          직접 선택
        </button>
      </div>
      <div className="range-row">
        <span className="range-tag sel">기간</span>
        <input
          type="date"
          value={from}
          disabled={pid !== "custom"}
          onChange={(e) => onChange(e.target.value, to)}
        />
        <span>~</span>
        <input
          type="date"
          value={to}
          disabled={pid !== "custom"}
          onChange={(e) => onChange(from, e.target.value)}
        />
      </div>
    </div>
  );
}
