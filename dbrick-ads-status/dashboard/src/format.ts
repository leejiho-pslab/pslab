import type { MetricFormat } from "./types";

export function formatValue(value: number | null | undefined, format?: MetricFormat): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency":
      return "₩" + Math.round(value).toLocaleString("ko-KR");
    case "percent":
      return value.toFixed(2) + "%";
    case "count":
      return Math.round(value).toLocaleString("ko-KR") + "건";
    default:
      return value.toLocaleString("ko-KR");
  }
}

// 기간 비교 표는 지표 키로 포맷을 추정한다.
export function formatByKey(value: number | null | undefined, key: string): string {
  if (value === null || value === undefined) return "—";
  if (key === "conversion_rate" || key === "ad_cost_ratio")
    return value.toFixed(2) + "%";
  if (["gross_sales", "ad_sales", "ad_cost", "aov"].includes(key))
    return "₩" + Math.round(value).toLocaleString("ko-KR");
  return Math.round(value).toLocaleString("ko-KR");
}

export function formatDelta(delta: number | null): { text: string; cls: string } {
  if (delta === null) return { text: "—", cls: "flat" };
  if (delta > 0) return { text: `▲ ${delta.toFixed(1)}%`, cls: "up" };
  if (delta < 0) return { text: `▼ ${Math.abs(delta).toFixed(1)}%`, cls: "down" };
  return { text: "0.0%", cls: "flat" };
}
