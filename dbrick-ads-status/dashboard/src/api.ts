import type {
  AdsChannel,
  AdsChannelTrend,
  AdsOverview,
  AdsSummary,
  AdsTrendRow,
  BestChange,
  Competitor,
  CompetitorCreatives,
  CompetitorDirectory,
  CompetitorMediaResponse,
  CompetitorTrendRow,
  NaverSearchItem,
  NaverTrend,
  Ga4SiteResponse,
  Ga4ChannelsResponse,
  Ga4PagesResponse,
  KeywordReportResponse,
  RegionStatus,
  Creative,
  CreativeFatigue,
  CreativeOverview,
  DailyDetailResponse,
  DailyResponse,
  DigestResponse,
  MetricsConfig,
  PeriodResponse,
  SummaryResponse,
  TrendResponse,
  VisitorTrendResponse,
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

  // 일일 브리핑(상단 배너)
  digest: (date?: string) => get<DigestResponse>(`/api/digest${q(date)}`),

  // 카페24 어드민 — from/to 주면 그 기간 합계 요약(상단 카드가 기간 비교표와 일치)
  summary: (from: string, to: string) =>
    get<SummaryResponse>(`/api/summary?from=${from}&to=${to}`),
  periodComparison: (date?: string) => get<PeriodResponse>(`/api/period-comparison${q(date)}`),
  daily: (from: string, to: string) => get<DailyResponse>(`/api/daily?from=${from}&to=${to}`),
  dailyDetail: (date?: string) => get<DailyDetailResponse>(`/api/daily-detail${q(date)}`),
  trend: (from: string, to: string) => get<TrendResponse>(`/api/trend?from=${from}&to=${to}`),
  visitorTrend: (from: string, to: string) =>
    get<VisitorTrendResponse>(`/api/visitor-trend?from=${from}&to=${to}`),

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
  adsChannelTrend: (from: string, to: string) =>
    get<AdsChannelTrend>(`/api/ads/channel-trend?from=${from}&to=${to}`),

  // 광고 히스토리(소재)
  creatives: (date?: string, topN = 10, sort = "roas") =>
    get<{ date: string | null; sort: string; creatives: Creative[] }>(
      `/api/creatives?top_n=${topN}&sort=${sort}${date ? `&date=${date}` : ""}`,
    ),
  creativesOverview: (from: string, to: string, sort = "roas") =>
    get<CreativeOverview>(`/api/creatives/overview?from=${from}&to=${to}&sort=${sort}`),
  // 네이버 검색광고 키워드 리포트 (광고비 기준 정렬)
  adsKeywords: (from: string, to: string, channel?: string, sort = "ad_cost", topN = 300) =>
    get<KeywordReportResponse>(
      `/api/ads/keywords?from=${from}&to=${to}&sort=${sort}&top_n=${topN}` +
        (channel ? `&channel=${channel}` : ""),
    ),
  creativesFatigue: (date?: string) =>
    get<{ date: string | null; items: CreativeFatigue[] }>(`/api/creatives/fatigue${q(date)}`),

  // 경쟁사
  competitors: (date?: string) =>
    get<{ date: string | null; competitors: Competitor[] }>(`/api/competitors${q(date)}`),
  competitorsTrend: (from: string, to: string) =>
    get<{ rows: CompetitorTrendRow[] }>(`/api/competitors/trend?from=${from}&to=${to}`),
  competitorsNaver: (from: string, to: string) =>
    get<{ search: NaverSearchItem[]; trend: NaverTrend }>(
      `/api/competitors/naver?from=${from}&to=${to}`,
    ),
  competitorsCreatives: (date?: string) =>
    get<{ date: string | null; competitors: CompetitorCreatives[] }>(
      `/api/competitors/creatives${q(date)}`,
    ),
  competitorsDirectory: () => get<CompetitorDirectory>("/api/competitors/directory"),
  competitorsMedia: (from: string, to: string) =>
    get<CompetitorMediaResponse>(`/api/competitors/media?from=${from}&to=${to}`),
  competitorsBestChanges: (date?: string) =>
    get<{ date: string | null; items: BestChange[] }>(`/api/competitors/best-changes${q(date)}`),

  // GA4 사이트 분석 (방문자/세션/페이지뷰/체류시간)
  ga4Site: (from: string, to: string) =>
    get<Ga4SiteResponse>(`/api/ga4/site?from=${from}&to=${to}`),
  ga4Channels: (from: string, to: string, cmpFrom: string, cmpTo: string) =>
    get<Ga4ChannelsResponse>(
      `/api/ga4/channels?from=${from}&to=${to}&cmp_from=${cmpFrom}&cmp_to=${cmpTo}`,
    ),
  ga4Pages: (from: string, to: string, topN = 10) =>
    get<Ga4PagesResponse>(`/api/ga4/pages?from=${from}&to=${to}&top_n=${topN}`),

  // 대시보드 하단 — 온라인 인입 지역 현황(구글 시트)
  regionStatus: () => get<RegionStatus>("/api/region-status"),
};
