import type {
  DailyDetailResponse,
  DailyResponse,
  MetricsConfig,
  PeriodResponse,
  SummaryResponse,
  TrendResponse,
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
  dailyDetail: (date?: string) =>
    get<DailyDetailResponse>(`/api/daily-detail${date ? `?date=${date}` : ""}`),
  trend: (from: string, to: string) =>
    get<TrendResponse>(`/api/trend?from=${from}&to=${to}`),
};
