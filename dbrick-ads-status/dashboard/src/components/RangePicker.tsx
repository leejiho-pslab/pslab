import { useState } from "react";
import { daysBefore } from "../util";

// 조회일(base)은 데일리 수집 특성상 '어제'(가장 최근 완료일)이다. 그래서 "어제" = 조회일 당일.
const PRESETS: [string, string, number, number][] = [
  ["yesterday", "어제", 0, 0],
  ["7d", "최근 7일", 6, 0],
  ["14d", "최근 14일", 13, 0],
  ["30d", "최근 30일", 29, 0],
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
  // "직접 선택"을 누르거나 날짜를 편집하면 강제 custom 모드로 전환한다.
  // 그 외에는 현재 from/to 가 어떤 프리셋과 일치하는지로 활성 버튼을 계산해
  // 부모가 넘긴 초기값과 버튼 표시가 어긋나지 않게 한다.
  const [forceCustom, setForceCustom] = useState(false);
  const matched =
    !forceCustom &&
    PRESETS.find(
      ([, , fromDays, toDays]) => daysBefore(base, fromDays) === from && daysBefore(base, toDays) === to
    );
  const pid = matched ? matched[0] : "custom";
  return (
    <div className="card period-selector">
      <div className="preset-row">
        {PRESETS.map(([id, label, fromDays, toDays]) => (
          <button
            key={id}
            className={pid === id ? "active" : ""}
            onClick={() => {
              setForceCustom(false);
              onChange(daysBefore(base, fromDays), daysBefore(base, toDays));
            }}
          >
            {label}
          </button>
        ))}
        <button className={pid === "custom" ? "active" : ""} onClick={() => setForceCustom(true)}>
          직접 선택
        </button>
      </div>
      <div className="range-row">
        <span className="range-tag sel">기간</span>
        <input
          type="date"
          value={from}
          disabled={pid !== "custom"}
          onChange={(e) => {
            setForceCustom(true);
            onChange(e.target.value, to);
          }}
        />
        <span>~</span>
        <input
          type="date"
          value={to}
          disabled={pid !== "custom"}
          onChange={(e) => {
            setForceCustom(true);
            onChange(from, e.target.value);
          }}
        />
      </div>
    </div>
  );
}
