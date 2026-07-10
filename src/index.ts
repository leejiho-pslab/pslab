/**
 * pslab-sns — 플러그인 기반 SNS 자동화 도구
 *
 * 공개 API 진입점. 프로그램에서 사용할 때는 createApp()으로
 * 모든 구성 요소가 연결된 인스턴스를 얻는다.
 */
import { PluginRegistry } from './core/registry.js';
import { Publisher } from './core/publisher.js';
import { Scheduler } from './core/scheduler.js';
import { Analytics } from './core/analytics.js';
import { ContentPipeline } from './core/content.js';
import type { PluginContext, SnsPlugin } from './core/plugin.js';
import { YouTubePlugin } from './plugins/youtube.js';
import { NaverBlogPlugin } from './plugins/naver-blog.js';
import { BloggerPlugin } from './plugins/blogger.js';
import { InstagramPlugin } from './plugins/instagram.js';
import { ThreadsPlugin } from './plugins/threads.js';
import { LinkedInPlugin } from './plugins/linkedin.js';
import { isDryRun, loadAllCredentials } from './core/config.js';
import { MarketResearch, type ResearchProvider } from './core/research.js';
import { Council } from './core/council.js';
import { AlertHub } from './core/alerts.js';
import { Orchestrator } from './core/orchestrator.js';
import { ClientStore } from './core/client.js';
import type { CycleRecord } from './core/orchestrator.js';
import { createTextProvider, createMediaProvider } from './core/providers.js';
import { DesignStudio, DesignStore } from './core/design.js';
import { PlanStore } from './core/plan.js';
import { GuidanceStore } from './core/guidance.js';

export * from './core/types.js';
export { PluginRegistry } from './core/registry.js';
export { Publisher } from './core/publisher.js';
export { Scheduler } from './core/scheduler.js';
export { Analytics } from './core/analytics.js';
export { ContentPipeline } from './core/content.js';
export { BasePlugin } from './core/plugin.js';
export type { SnsPlugin, PluginContext } from './core/plugin.js';
export { BloggerPlugin, markdownToHtml } from './plugins/blogger.js';

// 자동화 강화 계층 (설계도 둥근 벨트)
export { MarketResearch } from './core/research.js';
export type {
  ResearchResult,
  ResearchProvider,
  TopicCandidate,
  CompetitorRef,
} from './core/research.js';
export { ReviewGate } from './core/review.js';
export type { ReviewMode, ReviewPolicy, ReviewDecision } from './core/review.js';
export { Council } from './core/council.js';
export type { Direction, Advisor, CouncilContext } from './core/council.js';
export { CapabilityRegistry } from './core/capabilities.js';
export type { Capability, CapabilitySource } from './core/capabilities.js';
export { AlertHub, ConsoleAlertSink } from './core/alerts.js';
export type { Alert, AlertSink } from './core/alerts.js';
export { Orchestrator } from './core/orchestrator.js';
export type { CycleRecord, OrchestratorDeps } from './core/orchestrator.js';
export { AutomationDaemon } from './core/daemon.js';
export type { DaemonOptions } from './core/daemon.js';
export { StatusBoard } from './core/board.js';
export type { Board, ClientBoardRow } from './core/board.js';
export { renderDashboard } from './core/dashboard.js';
export {
  ClaudeTextProvider,
  PollinationsImageGenerator,
  GeminiImageGenerator,
  HostedImageProvider,
  ImgbbImageHost,
  createTextProvider,
  createMediaProvider,
  createImageHost,
  createImageGenerator,
} from './core/providers.js';
export type { ImageHost, ImageGenerator } from './core/providers.js';
export { DesignStudio, DesignStore, defaultDesignStyle } from './core/design.js';
export type { DesignStyle } from './core/design.js';
export { PlanStore, generatePlan, upcomingSlots, MANUAL_CHANNELS, isManualOnly } from './core/plan.js';
export { GuidanceStore, parseGuideBody, brandNotesText, BRAND_FIELDS } from './core/guidance.js';
export type { PlanItem, ContentPlan, PlanSlide, PlanPublication, PlanMetrics } from './core/plan.js';
export { LearningEngine, LearningStore } from './core/learning.js';
export type { LearningSummary, GroupStat } from './core/learning.js';
export { checkTokens, TokenHealthStore } from './core/token-health.js';
export type { TokenHealth, TokenStatus } from './core/token-health.js';
export { makeInsightComment, ruleComment } from './core/insight.js';
export { TelegramNotifier, createNotifier } from './core/notify.js';
export type { Notifier } from './core/notify.js';
export { WeeklyReportEngine, WeeklyReportStore, mondayOf } from './core/weekly.js';
export type { WeeklyReport, WeeklyChannelStat } from './core/weekly.js';
export { claudeText, claudeKey } from './core/claude.js';
export { ContentGenerator, createContentGenerator, CONTENT_DOCTRINE } from './core/generate.js';
export type { GenerateOptions } from './core/generate.js';
export {
  loadClient,
  loadClients,
  validateClientConfig,
  normalizeClientConfig,
  ClientStore,
} from './core/client.js';
export type { ClientConfig } from './core/client.js';

/** 기본 제공 플러그인 팩토리 목록 */
export function defaultPlugins(ctx: PluginContext): SnsPlugin[] {
  return [
    new YouTubePlugin(ctx),
    new NaverBlogPlugin(ctx),
    new BloggerPlugin(ctx),
    new InstagramPlugin(ctx),
    new ThreadsPlugin(ctx),
    new LinkedInPlugin(ctx),
  ];
}

export interface App {
  registry: PluginRegistry;
  publisher: Publisher;
  scheduler: Scheduler;
  analytics: Analytics;
  content: ContentPipeline;
}

export interface CreateAppOptions {
  dryRun?: boolean;
  /** 기본 플러그인 대신 직접 플러그인 목록을 주입할 수 있다. */
  plugins?: SnsPlugin[];
  content?: ConstructorParameters<typeof ContentPipeline>[0];
}

/**
 * 모든 구성 요소를 조립한 앱 인스턴스를 만든다.
 * 자격 증명은 호출자가 registry.connectAll()로 연결한다.
 */
export function createApp(options: CreateAppOptions = {}): App {
  const ctx: PluginContext = { dryRun: options.dryRun ?? isDryRun() };
  const registry = new PluginRegistry();
  registry.registerAll(options.plugins ?? defaultPlugins(ctx));

  const publisher = new Publisher(registry);
  const scheduler = new Scheduler(publisher);
  const analytics = new Analytics(registry);
  // 기본값: 환경에 키가 있으면 실제 AI 생성, 없으면 템플릿 폴백
  const content = new ContentPipeline(
    options.content ?? { text: createTextProvider(), media: createMediaProvider() },
  );

  return { registry, publisher, scheduler, analytics, content };
}

/** 앱을 만들고 환경 변수의 자격 증명으로 자동 연결까지 수행한다. */
export async function bootstrap(options: CreateAppOptions = {}): Promise<App> {
  const app = createApp(options);
  await app.registry.connectAll(loadAllCredentials());
  return app;
}

export interface Autopilot {
  app: App;
  research: MarketResearch;
  council: Council;
  alerts: AlertHub;
  store: ClientStore<CycleRecord>;
  orchestrator: Orchestrator;
}

export interface AutopilotOptions extends CreateAppOptions {
  /** 사이클 이력을 저장할 베이스 디렉터리 (클라이언트별 하위 폴더로 격리) */
  dataDir?: string;
  /** 실제 조사 데이터 소스 (없으면 결정론적 mock) */
  researchProvider?: ResearchProvider;
  /** 기존 App을 재사용 (없으면 새로 만든다) */
  app?: App;
}

/**
 * 둥근 벨트(오케스트레이터)까지 한 번에 조립한다.
 * createApp 위에 시장조사·회의·검수·알림·격리저장소를 얹은 자동 운영 세트.
 */
export function createAutopilot(options: AutopilotOptions = {}): Autopilot {
  const app = options.app ?? createApp(options);
  const research = new MarketResearch(options.researchProvider);
  const council = new Council();
  const alerts = new AlertHub();
  const store = new ClientStore<CycleRecord>(options.dataDir ?? './data/clients');

  const orchestrator = new Orchestrator({
    content: app.content,
    publisher: app.publisher,
    analytics: app.analytics,
    research,
    council,
    store,
    alerts,
    design: {
      studio: new DesignStudio(),
      store: new DesignStore(options.dataDir ?? './data/clients'),
    },
    plan: new PlanStore(options.dataDir ?? './data/clients'),
    guidance: new GuidanceStore(options.dataDir ?? './data/clients'),
  });

  return { app, research, council, alerts, store, orchestrator };
}
