import type {
  DailyResponse,
  MetricsConfig,
  PeriodResponse,
  SummaryResponse,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  metricsConfig: () => get<MetricsConfig>("/api/config/metrics"),
  dates: () => get<{ dates: string[] }>("/api/dates"),
  summary: (date?: string) =>
    get<SummaryResponse>(`/api/summary${date ? `?date=${date}` : ""}`),
  periodComparison: (date?: string) =>
    get<PeriodResponse>(`/api/period-comparison${date ? `?date=${date}` : ""}`),
  daily: (from: string, to: string) =>
    get<DailyResponse>(`/api/daily?from=${from}&to=${to}`),
};
