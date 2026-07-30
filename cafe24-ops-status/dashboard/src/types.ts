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

// ── GA4 사이트 분석 ────────────────────────────────────────────
export interface Ga4Summary {
  visitors: number;
  sessions: number;
  page_views: number;
  new_users: number;
  returning_users: number;
  avg_session_duration: number | null;
  pages_per_session: number | null;
  days: number;
}
export interface Ga4TrendRow {
  date: string;
  visitors: number | null;
  sessions: number | null;
  page_views: number | null;
  avg_session_duration: number | null;
  new_users: number | null;
  returning_users: number | null;
}
export interface Ga4SiteResponse {
  from: string;
  to: string;
  summary: Ga4Summary;
  trend: Ga4TrendRow[];
}
export interface Ga4ChannelRow {
  channel: string;
  label: string;
  is_ad: boolean;
  sessions: number;
  users: number;
  conversions: number;
  cvr: number | null;
  prev_sessions: number;
  sessions_delta: number | null;
  source_mediums: string[];
}
export interface Ga4SourceMediumRow {
  source_medium: string;
  channel: string;
  label: string;
  is_ad: boolean;
  sessions: number;
  users: number;
  conversions: number;
  cvr: number | null;
  prev_sessions: number | null;
  sessions_delta: number | null;
}
export interface Ga4ChannelsResponse {
  from: string;
  to: string;
  cmp_from: string;
  cmp_to: string;
  channels: Ga4ChannelRow[];
  rows: Ga4SourceMediumRow[];
}
export interface Ga4PageRow {
  page: string;
  views: number;
}
export interface Ga4EntryPage {
  page: string;
  sessions: number;
  share: number;
}
export interface Ga4EntryPath {
  channel: string;
  label: string;
  is_ad: boolean;
  sessions: number;
  pages: Ga4EntryPage[];
}
export interface Ga4ExitPage {
  page: string;
  sessions: number;
  bounce_rate: number | null;
  engagement_rate: number | null;
  prev_bounce_rate: number | null;
  bounce_delta: number | null;
}
export interface Ga4FunnelStep {
  event: string;
  label: string;
  count: number;
  step_rate: number | null;
  overall_rate: number | null;
  drop: number | null;
}
export interface Ga4Funnel {
  channel: string | null;
  steps: Ga4FunnelStep[];
  bottleneck: string | null;
}
export interface Ga4FunnelChannel {
  channel: string;
  label: string;
  is_ad: boolean;
  start: number;
  purchases: number;
  cvr: number | null;
  bottleneck: string | null;
}
export interface Ga4JourneyResponse {
  from: string;
  to: string;
  cmp_from: string;
  cmp_to: string;
  channel: string | null;
  entry_paths: Ga4EntryPath[];
  exit_pages: Ga4ExitPage[];
  funnel: Ga4Funnel;
  funnel_channels: Ga4FunnelChannel[];
}

// ── 카페24 접속통계 (GA4 가 못 주는 것) ─────────────────────────
export interface ShopVisitSummary {
  visits: number;
  first_visits: number;
  re_visits: number;
  re_visit_rate: number | null;
  days: number;
}
export interface ShopVisitRow {
  date: string;
  visits: number | null;
  first_visits: number | null;
  re_visits: number | null;
}
export interface ShopRankedRow {
  name: string;
  visits: number;
  share: number;
  prev_visits: number | null;
  delta: number | null;
  is_new: boolean;
}
export interface ShopFunnelRow {
  product_no: string;
  product: string;
  views: number;
  cart_adds: number;
  cart_rate: number | null;
  orders: number;
  order_rate: number | null;
  overall_rate: number | null;
  amount: number;
}
export interface ShopBottleneck {
  total_views: number;
  total_cart_adds: number;
  total_orders: number;
  cart_rate: number | null;
  order_rate: number | null;
  median_cart_rate: number | null;
  laggards: ShopFunnelRow[];
}
export interface ShopPageRow {
  url: string;
  views: number;
  visits: number;
  first_visits: number;
  views_per_visit: number | null;
}
export interface ShopMemberSplit {
  member_orders: number;
  member_amount: number;
  nonmember_orders: number;
  nonmember_amount: number;
  nonmember_order_share: number | null;
  nonmember_amount_share: number | null;
  member_aov: number | null;
  nonmember_aov: number | null;
}
export interface ShopAnalytics {
  from: string;
  to: string;
  cmp_from: string;
  cmp_to: string;
  summary: ShopVisitSummary;
  trend: ShopVisitRow[];
  funnel: ShopFunnelRow[];
  bottleneck: ShopBottleneck;
  keywords: ShopRankedRow[];
  referrers: ShopRankedRow[];
  ads: ShopRankedRow[];
  pages: ShopPageRow[];
  member: ShopMemberSplit;
}
