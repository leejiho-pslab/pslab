import type {
  AdsChannel,
  AdsOverview,
  AdsSummary,
  AdsTrendRow,
  Competitor,
  CompetitorTrendRow,
  Creative,
  CreativeFatigue,
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

const q = (date?: string) => (date ? `?date=${date}` : "");

export const api = {
  metricsConfig: () => get<MetricsConfig>("/api/config/metrics"),
  dates: () => get<{ dates: string[] }>("/api/dates"),

  // 카페24 어드민
  summary: (date?: string) => get<SummaryResponse>(`/api/summary${q(date)}`),
  periodComparison: (date?: string) => get<PeriodResponse>(`/api/period-comparison${q(date)}`),
  daily: (from: string, to: string) => get<DailyResponse>(`/api/daily?from=${from}&to=${to}`),
  dailyDetail: (date?: string) => get<DailyDetailResponse>(`/api/daily-detail${q(date)}`),
  trend: (from: string, to: string) => get<TrendResponse>(`/api/trend?from=${from}&to=${to}`),

  // 광고
  adsSummary: (date?: string) => get<AdsSummary>(`/api/ads/summary${q(date)}`),
  adsChannels: (date?: string) =>
    get<{ date: string | null; channels: AdsChannel[] }>(`/api/ads/channels${q(date)}`),
  adsTrend: (from: string, to: string) =>
    get<{ rows: AdsTrendRow[] }>(`/api/ads/trend?from=${from}&to=${to}`),
  adsOverview: (r: { selFrom: string; selTo: string; cmpFrom: string; cmpTo: string }) =>
    get<AdsOverview>(
      `/api/ads/overview?from=${r.selFrom}&to=${r.selTo}&cmp_from=${r.cmpFrom}&cmp_to=${r.cmpTo}`,
    ),

  // 광고 히스토리(소재)
  creatives: (date?: string, topN = 10, sort = "roas") =>
    get<{ date: string | null; sort: string; creatives: Creative[] }>(
      `/api/creatives?top_n=${topN}&sort=${sort}${date ? `&date=${date}` : ""}`,
    ),
  creativesFatigue: (date?: string) =>
    get<{ date: string | null; items: CreativeFatigue[] }>(`/api/creatives/fatigue${q(date)}`),

  // 경쟁사
  competitors: (date?: string) =>
    get<{ date: string | null; competitors: Competitor[] }>(`/api/competitors${q(date)}`),
  competitorsTrend: (from: string, to: string) =>
    get<{ rows: CompetitorTrendRow[] }>(`/api/competitors/trend?from=${from}&to=${to}`),
};
