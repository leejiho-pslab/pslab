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
import { InstagramPlugin } from './plugins/instagram.js';
import { ThreadsPlugin } from './plugins/threads.js';
import { LinkedInPlugin } from './plugins/linkedin.js';
import { isDryRun, loadAllCredentials } from './core/config.js';

export * from './core/types.js';
export { PluginRegistry } from './core/registry.js';
export { Publisher } from './core/publisher.js';
export { Scheduler } from './core/scheduler.js';
export { Analytics } from './core/analytics.js';
export { ContentPipeline } from './core/content.js';
export { BasePlugin } from './core/plugin.js';
export type { SnsPlugin, PluginContext } from './core/plugin.js';

/** 기본 제공 플러그인 팩토리 목록 */
export function defaultPlugins(ctx: PluginContext): SnsPlugin[] {
  return [
    new YouTubePlugin(ctx),
    new NaverBlogPlugin(ctx),
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
  const content = new ContentPipeline(options.content);

  return { registry, publisher, scheduler, analytics, content };
}

/** 앱을 만들고 환경 변수의 자격 증명으로 자동 연결까지 수행한다. */
export async function bootstrap(options: CreateAppOptions = {}): Promise<App> {
  const app = createApp(options);
  await app.registry.connectAll(loadAllCredentials());
  return app;
}
