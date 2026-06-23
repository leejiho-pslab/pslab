export type MetricFormat = "currency" | "count" | "percent" | string;

export interface SummaryCard {
  key: string;
  label: string;
  format?: MetricFormat;
  value?: number | null;
}

export interface MetricsConfig {
  collection: { granularity: string; run_at: string; compare_windows: string[] };
  summary_cards: SummaryCard[];
  period_comparison: { key: string; label: string }[];
  daily_groups: { name: string; metrics?: string[]; top_n?: number }[];
  charts: { type: string; title: string }[];
}

export interface SummaryResponse {
  date: string | null;
  cards: SummaryCard[];
}

export interface PeriodRow {
  key: string;
  label: string;
  values: Record<string, number | null>;
  delta_recent_vs_prev: number | null;
}

export interface PeriodResponse {
  date: string | null;
  rows: PeriodRow[];
}

export interface DailyRow {
  date: string;
  metric: string;
  value: number;
}

export interface DailyResponse {
  from: string;
  to: string;
  rows: DailyRow[];
}
