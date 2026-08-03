import { useState } from "react";
import { PRESETS, computeRanges, type Preset, type Ranges } from "../periods";

// 선택기간 vs 비교기간 선택기. 프리셋 또는 직접 날짜 입력.
export function PeriodSelector({
  base,
  ranges,
  onChange,
}: {
  base: string;
  ranges: Ranges;
  onChange: (r: Ranges, preset: Preset) => void;
}) {
  const [preset, setPreset] = useState<Preset>("yesterday");

  const pick = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") onChange(computeRanges(base, p), p);
  };
  const setField = (k: keyof Ranges, v: string) => onChange({ ...ranges, [k]: v }, "custom");

  return (
    <div className="card period-selector">
      <div className="preset-row">
        {PRESETS.map((p) => (
          <button key={p.id} className={preset === p.id ? "active" : ""} onClick={() => pick(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="range-row">
        <span className="range-tag sel">선택기간</span>
        <DateBox value={ranges.selFrom} onChange={(v) => setField("selFrom", v)} disabled={preset !== "custom"} />
        <span>~</span>
        <DateBox value={ranges.selTo} onChange={(v) => setField("selTo", v)} disabled={preset !== "custom"} />
        <span className="range-tag cmp">비교기간</span>
        <DateBox value={ranges.cmpFrom} onChange={(v) => setField("cmpFrom", v)} disabled={preset !== "custom"} />
        <span>~</span>
        <DateBox value={ranges.cmpTo} onChange={(v) => setField("cmpTo", v)} disabled={preset !== "custom"} />
      </div>
    </div>
  );
}

function DateBox({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <input type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
  );
}
