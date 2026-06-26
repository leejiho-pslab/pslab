#!/usr/bin/env node
/**
 * pslab CLI — SNS 자동화 명령줄 도구
 *
 * 사용법:
 *   pslab status                          연결 상태 확인
 *   pslab generate --topic "..." [opts]   콘텐츠 생성 (출력만)
 *   pslab publish --topic "..." [opts]    생성 후 즉시 발행
 *   pslab schedule --at <ISO> --topic ... 예약 발행
 *   pslab report                          데모 성과 리포트
 *
 * 공통 옵션:
 *   --targets youtube,instagram,...   대상 플랫폼 (생략 시 연결된 전체)
 *   --tone "캐주얼"                    톤앤매너
 *   --link "https://..."              CTA 링크
 *   --title "..."                     제목 (블로그/유튜브)
 *   --video <path> / --image <path>   미디어 첨부
 */
import { bootstrap, Analytics, createAutopilot } from './index.js';
import type { App } from './index.js';
import type { PlatformId, PostContent } from './core/types.js';
import { ContentPipeline } from './core/content.js';
import type { ContentBrief } from './core/content.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadClients, ClientStore } from './core/client.js';
import { AutomationDaemon } from './core/daemon.js';
import { StatusBoard } from './core/board.js';
import { renderDashboard } from './core/dashboard.js';
import { DesignStore } from './core/design.js';
import { PlanStore } from './core/plan.js';
import { createContentGenerator } from './core/generate.js';
import type { PlatformId as PlatformIdT } from './core/types.js';
import type { CycleRecord } from './core/orchestrator.js';

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command = 'help', ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return { command, args };
}

function parseTargets(args: Args): PlatformId[] | undefined {
  const raw = args.targets;
  if (typeof raw !== 'string') return undefined;
  return raw.split(',').map((s) => s.trim()) as PlatformId[];
}

function briefFromArgs(args: Args): ContentBrief {
  const topic = typeof args.topic === 'string' ? args.topic : '새 소식';
  const media: ContentBrief['media'] = [];
  if (typeof args.video === 'string') {
    media.push({ kind: 'video', prompt: args.video });
  }
  if (typeof args.image === 'string') {
    media.push({ kind: 'image', prompt: args.image });
  }
  return {
    topic,
    tone: typeof args.tone === 'string' ? args.tone : undefined,
    link: typeof args.link === 'string' ? args.link : undefined,
    media: media.length > 0 ? media : undefined,
  };
}

async function buildContent(args: Args): Promise<PostContent> {
  const pipeline = new ContentPipeline();
  const content = await pipeline.generate(briefFromArgs(args));
  // CLI에서 미디어 경로를 직접 지정하면 플레이스홀더 대신 실제 경로로 교체
  if (typeof args.video === 'string') {
    content.media = [
      { kind: 'video', source: args.video, alt: content.title },
    ];
  } else if (typeof args.image === 'string') {
    content.media = [
      { kind: 'image', source: args.image, alt: content.title },
    ];
  }
  if (typeof args.title === 'string') content.title = args.title;
  return content;
}

function printResults(label: string, results: { platform: string; ok: boolean; url?: string; error?: string }[]): void {
  console.log(`\n${label}`);
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    const detail = r.ok ? r.url : r.error;
    console.log(`  ${icon} ${r.platform.padEnd(12)} ${detail ?? ''}`);
  }
}

async function cmdStatus(app: App): Promise<void> {
  console.log('🔌 플러그인 연결 상태\n');
  for (const plugin of app.registry.all()) {
    const icon = plugin.isConnected() ? '🟢' : '⚪';
    const state = plugin.isConnected() ? '연결됨' : '미연결 (자격 증명 없음)';
    console.log(`  ${icon} ${plugin.displayName.padEnd(16)} ${state}`);
  }
  console.log(
    '\n자격 증명은 .env 에 PSLAB_<PLATFORM>_<KEY> 형식으로 설정하세요 (.env.example 참고).',
  );
}

async function cmdGenerate(args: Args): Promise<void> {
  const content = await buildContent(args);
  console.log('\n📝 생성된 콘텐츠\n');
  console.log(JSON.stringify(content, null, 2));
}

async function cmdPublish(app: App, args: Args): Promise<void> {
  const content = await buildContent(args);
  const targets = parseTargets(args);
  const result = await app.publisher.publish(content, { targets });
  printResults(`📤 발행 결과 [${result.contentId}]`, result.results);

  // 발행 직후 성과 데모 (드라이런이라도 시뮬레이션 지표 제공)
  const tracked = Analytics.fromPublishResults(result.results);
  if (tracked.length > 0) {
    const report = await app.analytics.collect(tracked);
    console.log('\n' + Analytics.format(report));
  }
}

async function cmdSchedule(app: App, args: Args): Promise<void> {
  const atRaw = typeof args.at === 'string' ? args.at : undefined;
  if (!atRaw) {
    console.error('--at <ISO 시각> 이 필요합니다. 예: --at 2026-06-23T09:00:00Z');
    process.exitCode = 1;
    return;
  }
  const runAt = new Date(atRaw);
  if (Number.isNaN(runAt.getTime())) {
    console.error(`잘못된 시각 형식: ${atRaw}`);
    process.exitCode = 1;
    return;
  }
  const content = await buildContent(args);
  const targets = parseTargets(args);
  const job = app.scheduler.schedule(content, runAt, { targets });
  console.log(
    `\n⏰ 예약 완료 [${job.id}] — ${runAt.toISOString()} 에 ${
      targets?.join(', ') ?? '연결된 전체 플랫폼'
    } 발행`,
  );
  console.log(
    '주의: CLI는 1회성 프로세스입니다. 예약 발행을 실제로 수행하려면 데몬/서버에서 스케줄러를 유지하세요.',
  );
}

async function cmdReport(app: App, args: Args): Promise<void> {
  // 데모용: 임의의 게시물을 발행한 뒤 성과를 수집한다.
  const content = await buildContent(args);
  const targets = parseTargets(args);
  const pub = await app.publisher.publish(content, { targets });
  const tracked = Analytics.fromPublishResults(pub.results);
  const report = await app.analytics.collect(tracked);
  console.log('\n' + Analytics.format(report));
}

async function cmdClients(args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const clients = loadClients(dir);
  console.log(`\n🏭 클라이언트 (${dir}) — ${clients.length}곳\n`);
  for (const c of clients) {
    const accts = Object.entries(c.accounts ?? {})
      .map(([p, h]) => `${p}:@${h}`)
      .join(' ');
    console.log(
      `  • ${c.name} (${c.id}) — ${c.industry} | 검수:${c.reviewMode} | 채널:${c.targets.join(',')}${accts ? ` | 계정 ${accts}` : ''}`,
    );
  }
  if (clients.length === 0) {
    console.log('  (설정표 없음) clients/ 폴더에 *.json 설정표를 추가하세요. 예시: clients/demo-cafe.example.json');
  }
}

async function cmdCycle(app: App, args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const only = typeof args.client === 'string' ? args.client : undefined;
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';

  const clients = loadClients(dir).filter((c) => !only || c.id === only);
  if (clients.length === 0) {
    console.error(`실행할 클라이언트가 없습니다 (dir=${dir}${only ? `, client=${only}` : ''}).`);
    process.exitCode = 1;
    return;
  }

  const auto = createAutopilot({ app, dataDir });
  for (const client of clients) {
    console.log(`\n▶ 사이클 — ${client.name} (${client.id})`);
    const rec = await auto.orchestrator.runCycle(client);
    console.log(`  주제: ${rec.topic} (${rec.suggestedFormat})`);
    console.log(`  검수: ${rec.review.reviewer} → ${rec.review.approved ? '승인' : rec.review.pending ? '사람 대기' : '보류'}`);
    if (rec.publishSummary) {
      console.log(`  발행: ${rec.publishSummary.ok}/${rec.publishSummary.total} 채널 성공`);
    }
    console.log(`  참여율: ${(rec.avgEngagementRate * 100).toFixed(1)}%`);
    console.log(`  다음 방향: ${rec.direction.rationale}`);
  }
}

async function cmdDaemon(app: App, args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const intervalMs =
    typeof args.interval === 'string' ? Number(args.interval) * 1000 : 60_000;
  const once = args.once === true;

  const clients = loadClients(dir);
  if (clients.length === 0) {
    console.error(`클라이언트가 없습니다 (dir=${dir}).`);
    process.exitCode = 1;
    return;
  }

  const auto = createAutopilot({ app, dataDir });
  const daemon = new AutomationDaemon(auto.orchestrator, clients, {
    intervalMs,
    alerts: auto.alerts,
    onCycle: (id, ok) =>
      console.log(`  ↳ [${id}] 사이클 ${ok ? '완료✅' : '발행안함/실패'}`),
  });

  if (once) {
    console.log('▶ 데몬 1회 실행 (모든 클라이언트 즉시 한 사이클)\n');
    await daemon.runOnce();
    return;
  }

  console.log('🟢 무인 데몬(관리인) 시작 — Ctrl+C 로 종료');
  console.log(`   점검 간격: ${intervalMs / 1000}s | 시간대: ${process.env.TZ ?? '서버 로컬'}`);
  for (const c of clients) {
    console.log(`   • ${c.name} → ${c.scheduleTimes.join(', ')}`);
  }
  daemon.start();

  // 프로세스를 살려 두고 종료 신호를 기다린다.
  await new Promise<void>((resolve) => {
    const shutdown = () => {
      daemon.stop();
      resolve();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}

async function cmdBoard(args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const clients = loadClients(dir);
  const store = new ClientStore<CycleRecord>(dataDir);
  const board = new StatusBoard(store);
  if (args.json === true) {
    console.log(JSON.stringify(board.build(clients), null, 2));
  } else {
    console.log('\n' + StatusBoard.format(board.build(clients)));
  }
}

async function cmdDashboard(args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const out = typeof args.out === 'string' ? args.out : './docs/index.html';
  const clients = loadClients(dir);
  const store = new ClientStore<CycleRecord>(dataDir);
  const designStore = new DesignStore(dataDir);
  const planStore = new PlanStore(dataDir);
  const html = renderDashboard(clients, store, designStore, planStore);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  console.log(`🖥️  대시보드 생성: ${out} (클라이언트 ${clients.length}곳)`);
}

async function cmdGeneratePlan(args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const only = typeof args.client === 'string' ? args.client : undefined;
  const channel = (typeof args.channel === 'string' ? args.channel : 'instagram') as PlatformIdT;
  const count = typeof args.count === 'string' ? Number(args.count) : 6;

  const gen = createContentGenerator();
  if (!gen) {
    console.error('ANTHROPIC_API_KEY가 없어 자동 생성을 건너뜁니다 (검수 우선: 기존 큐레이션 유지).');
    return;
  }
  const clients = loadClients(dir).filter((c) => !only || c.id === only);
  const store = new PlanStore(dataDir);
  for (const client of clients) {
    console.log(`\n🤖 기획 생성 — ${client.name} / ${channel} × ${count}`);
    const items = await gen.generate(client, { channel, count });
    const plan = store.load(client.id);
    // 같은 채널의 자동 생성분(*-gen-*)만 교체, 사람이 만든 큐레이션은 보존
    plan.items = plan.items.filter(
      (it) => !(it.channels.includes(channel) && it.id.includes('-gen-')),
    );
    plan.items.push(...items);
    plan.updatedAt = new Date().toISOString();
    store.save(client.id, plan);
    console.log(`  ${items.length}건 생성·저장 (status=planned, 발행 전 검수 대기)`);
  }
}

function printHelp(): void {
  console.log(
    [
      'pslab — 플러그인 기반 SNS 자동화 CLI',
      '',
      '명령:',
      '  status                연결된 플러그인 확인',
      '  generate              콘텐츠 생성 후 출력',
      '  publish               생성 후 즉시 멀티채널 발행',
      '  schedule --at <ISO>   예약 발행 등록',
      '  report                성과 리포트 (데모)',
      '  clients               등록된 클라이언트(설정표) 목록',
      '  cycle [--client id]   오토파일럿 한 사이클 실행 (조사→제작→검수→발행→회의)',
      '  daemon [--once]       무인 데몬 — 시간표(scheduleTimes)에 맞춰 자동 트리거',
      '  board [--json]        관제실 상황판 — 클라이언트별 현황 한눈에',
      '  dashboard [--out p]   실시간 대시보드 HTML 생성 (기본 docs/index.html)',
      '  generate-plan         AI 기획 생성 (--channel instagram --count 6, 발행 전 검수)',
      '',
      '옵션: --topic --title --tone --link --targets a,b --video <p> --image <p>',
      '      --clients-dir ./clients --client <id> --data-dir ./data/clients',
      '      --interval <초> --once   (daemon 전용)',
      '',
      '예) pslab publish --topic "신제품 출시" --targets instagram,threads --image hero.png',
      '예) pslab cycle --client demo-cafe',
      '예) TZ=Asia/Seoul pslab daemon          # 11:00,19:00 에 자동 발행',
      '예) pslab daemon --once                  # 지금 전체 1사이클',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));

  if (command === 'help' || args.help) {
    printHelp();
    return;
  }

  const app = await bootstrap();

  switch (command) {
    case 'status':
      await cmdStatus(app);
      break;
    case 'generate':
      await cmdGenerate(args);
      break;
    case 'publish':
      await cmdPublish(app, args);
      break;
    case 'schedule':
      await cmdSchedule(app, args);
      break;
    case 'report':
      await cmdReport(app, args);
      break;
    case 'clients':
      await cmdClients(args);
      break;
    case 'cycle':
      await cmdCycle(app, args);
      break;
    case 'daemon':
      await cmdDaemon(app, args);
      break;
    case 'board':
      await cmdBoard(args);
      break;
    case 'dashboard':
      await cmdDashboard(args);
      break;
    case 'generate-plan':
      await cmdGeneratePlan(args);
      break;
    default:
      console.error(`알 수 없는 명령: ${command}\n`);
      printHelp();
      process.exitCode = 1;
  }

  app.scheduler.shutdown();
}

main().catch((err) => {
  console.error('실행 오류:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
