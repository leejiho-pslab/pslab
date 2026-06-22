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
import { bootstrap, Analytics } from './index.js';
import type { App } from './index.js';
import type { PlatformId, PostContent } from './core/types.js';
import { ContentPipeline } from './core/content.js';
import type { ContentBrief } from './core/content.js';

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
      '',
      '옵션: --topic --title --tone --link --targets a,b --video <p> --image <p>',
      '',
      '예) pslab publish --topic "신제품 출시" --targets instagram,threads --image hero.png',
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
