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

export interface BreakdownItem {
  key: string;
  value: number;
}

export interface DevicePerf {
  device: string;
  sales: number;
  order_count: number;
  aov: number | null;
  share: number | null;
}

export interface VisitorDetail {
  visitors: number | null;
  new: number | null;
  returning: number | null;
  return_rate: number | null;
  signups: number | null;
  signup_rate: number | null;
}

export interface DailyDetailResponse {
  date: string | null;
  device: BreakdownItem[];
  device_perf: DevicePerf[];
  visitor: VisitorDetail;
  category: BreakdownItem[];
  best: BreakdownItem[];
  crm: Record<string, number>;
}

export interface VisitorTrendRow {
  date: string;
  visitors?: number;
  new?: number;
  returning?: number;
  signups?: number;
}
export interface VisitorTrendResponse {
  from: string;
  to: string;
  rows: VisitorTrendRow[];
}

export interface TrendRow {
  date: string;
  gross_sales: number | null;
  ad_cost: number | null;
  ad_cost_ratio: number | null;
  new_sales: number | null;
  returning_sales: number | null;
}

export interface TrendResponse {
  from: string;
  to: string;
  rows: TrendRow[];
}

// ── 광고 대시보드 ──────────────────────────────────────────────
export interface AdsSummary {
  date: string | null;
  ad_cost: number;
  ad_sales: number;
  roas: number | null;
  ad_share: number | null;
  gross_sales: number | null;
  channels: number;
}

export interface AdsChannel {
  channel: string;
  ad_cost: number;
  ad_sales: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number | null;
  ctr: number | null;
  cvr: number | null;
  cpc: number | null;
  cpa: number | null;
  budget_share?: number;
}

export interface AdsSummaryRange {
  ad_cost: number;
  ad_sales: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number | null;
  ctr: number | null;
  cvr: number | null;
  ad_share: number | null;
  gross_sales: number;
  channels: number;
}

export interface AdsOverview {
  selected: { from: string; to: string; summary: AdsSummaryRange; channels: AdsChannel[] };
  comparison: { from: string; to: string; summary: AdsSummaryRange; channels: AdsChannel[] };
  deltas: Record<string, number | null>;
}

export interface AdsTrendRow {
  date: string;
  ad_cost: number;
  ad_sales: number;
  roas: number | null;
}

export interface AdsChannelTrend {
  channels: string[];
  trend: Record<string, AdsTrendRow[]>;
}

// ── 광고 히스토리(소재) ────────────────────────────────────────
export interface Creative {
  creative_id: string;
  name: string;
  channel: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ad_cost: number;
  ad_sales: number;
  ctr: number | null;
  roas: number | null;
  cvr: number | null;
  cpc?: number | null;
  thumb?: string | null;
}

export interface CreativeSummary {
  creative_count: number;
  channels: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ad_cost: number;
  ad_sales: number;
  roas: number | null;
  ctr: number | null;
  cvr: number | null;
}

export interface CreativeByChannel {
  channel: string;
  creatives: Creative[];
}

export interface CreativeOverview {
  from: string;
  to: string;
  summary: CreativeSummary;
  creatives: Creative[];
  by_channel: CreativeByChannel[];
}

// ── 광고 히스토리(네이버 키워드) ─────────────────────────────────
export interface KeywordRow {
  keyword: string;
  adgroup: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ad_cost: number;
  ctr: number | null;
  cpc: number | null;
}

export interface KeywordSummary {
  keyword_count: number;
  impressions: number;
  clicks: number;
  ad_cost: number;
  conversions: number;
  ctr: number | null;
  cpc: number | null;
}

export interface KeywordReport {
  from: string;
  to: string;
  channel: string;
  sort: string;
  summary: KeywordSummary;
  keywords: KeywordRow[];
}

export interface CreativeFatigue {
  creative_id: string;
  name: string;
  channel: string;
  recent_roas: number | null;
  prior_roas: number | null;
  change_pct: number | null;
  fatigued: boolean;
}

// ── 월간 리포트 ────────────────────────────────────────────
export interface MrDelta { text: string; dir: "good" | "bad" | "flat"; pct?: number }
export interface MrKpiRow { label: string; a: string; b: string; delta: MrDelta }
export interface MrChannelRow {
  channel: string;
  ad_cost: string; ad_cost_d: MrDelta;
  impressions: string; impressions_d: MrDelta;
  clicks: string; clicks_d: MrDelta;
  ctr: string; ctr_d: MrDelta;
  cpc: string; cpc_d: MrDelta;
  ad_sales: string;
  roas: string; roas_d: MrDelta;
}
export interface MrKeyword { keyword: string; campaign: string | null; ad_cost: string; clicks: string; ctr: string; cpc: string }
export interface MrStrategy { title: string; body: string }
export interface MonthlyReport {
  target: string; compare: string; target_label: string; compare_label: string;
  headline: string;
  kpi_rows: MrKpiRow[];
  channel_rows: MrChannelRow[];
  improved: string[]; declined: string[];
  interpretation: string; keyword_note: string;
  top_keywords: MrKeyword[];
  strategy_draft: MrStrategy[];
}

// ── 경쟁사 모니터링 ────────────────────────────────────────────
export interface Competitor {
  name: string;
  active_promotions: number | null;
  new_reviews: number | null;
  avg_rating: number | null;
  ad_count: number | null;
  best_products: string[];
}

export interface CompetitorTrendRow {
  date: string;
  active_promotions: number;
  new_reviews: number;
  ad_count: number;
}

export interface NaverSearchItem {
  competitor: string;
  volume: number;
}

export interface NaverTrend {
  competitors: string[];
  rows: Array<Record<string, number | string>>;
}

export interface CompetitorAd {
  platform: string;
  title: string;
  impressions: number;
}

export interface CompetitorCreatives {
  name: string;
  creatives: CompetitorAd[];
}

export interface RankChange {
  product: string;
  prev_rank: number;
  cur_rank: number;
  delta: number;
}

export interface BestChange {
  name: string;
  new_entries: string[];
  rank_changes: RankChange[];
}

export interface DigestAlert {
  level: string;
  type: string;
  message: string;
  value?: number;
}
export interface DigestCommentary {
  headline: string;
  core: string[];
  movers: string[];
  anomalies: string[];
  ads: string[];
}
export interface DigestResponse {
  date: string | null;
  lines: string[];
  alerts: DigestAlert[];
  commentary?: DigestCommentary;
}
