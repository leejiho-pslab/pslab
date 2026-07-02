// 선택기간 vs 비교기간 계산 (프리셋: 어제/전주/전월/전년 동기간 + 직접 선택)

export type Preset = "yesterday" | "week" | "month" | "year" | "custom";

export interface Ranges {
  selFrom: string;
  selTo: string;
  cmpFrom: string;
  cmpTo: string;
}

const iso = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
const parse = (s: string) => new Date(s + "T00:00:00");
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

export const PRESETS: { id: Preset; label: string }[] = [
  { id: "yesterday", label: "어제" },
  { id: "week", label: "전주 동기간" },
  { id: "month", label: "전월 동기간" },
  { id: "year", label: "전년 동기간" },
  { id: "custom", label: "직접 선택" },
];

export function computeRanges(base: string, preset: Preset): Ranges {
  const d = parse(base);
  switch (preset) {
    case "yesterday":
      // 조회일(base)은 곧 '어제'(최근 완료일) → 그날 실적을 전일과 비교. RangePicker "어제"와 동일.
      return {
        selFrom: base, selTo: base,
        cmpFrom: addDays(base, -1), cmpTo: addDays(base, -1),
      };
    case "week":
      return { selFrom: addDays(base, -6), selTo: base, cmpFrom: addDays(base, -13), cmpTo: addDays(base, -7) };
    case "month": {
      const selFrom = iso(new Date(d.getFullYear(), d.getMonth(), 1));
      const cmpFrom = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
      const cmpTo = iso(new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()));
      return { selFrom, selTo: base, cmpFrom, cmpTo };
    }
    case "year": {
      const selFrom = iso(new Date(d.getFullYear(), d.getMonth(), 1));
      const cmpFrom = iso(new Date(d.getFullYear() - 1, d.getMonth(), 1));
      const cmpTo = iso(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
      return { selFrom, selTo: base, cmpFrom, cmpTo };
    }
    default:
      return { selFrom: addDays(base, -6), selTo: base, cmpFrom: addDays(base, -13), cmpTo: addDays(base, -7) };
  }
}
