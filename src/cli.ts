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
import { PlanStore, MANUAL_CHANNELS, isManualOnly } from './core/plan.js';
import { GuidanceStore } from './core/guidance.js';
import { LearningEngine, LearningStore } from './core/learning.js';
import { checkTokens, TokenHealthStore } from './core/token-health.js';
import { loadCredentials } from './core/config.js';
import { makeInsightComment } from './core/insight.js';
import { createNotifier } from './core/notify.js';
import { WeeklyReportEngine, WeeklyReportStore } from './core/weekly.js';
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

/** 텔레그램 HTML parse_mode용 이스케이프 (에러 문자열에 <>&가 섞여도 전송 실패 방지) */
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  const learnStore = new LearningStore(dataDir);
  const tokenStore = new TokenHealthStore(dataDir);
  const reportStore = new WeeklyReportStore(dataDir);
  const html = renderDashboard(clients, store, designStore, planStore, learnStore, tokenStore, reportStore, new GuidanceStore(dataDir));
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
  const learnStore = new LearningStore(dataDir);
  for (const client of clients) {
    const learning = learnStore.load(client.id);
    if (learning?.bestVariant) {
      console.log(`  🧠 학습 반영: 우세 디자인 ${learning.bestVariant}안 + 성과 힌트 ${learning.hints.length}건`);
    }
    console.log(`\n🤖 기획 생성 — ${client.name} / ${channel} × ${count}`);
    const items = await gen.generate(client, { channel, count, learning });
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

async function cmdPublishPlan(app: App, args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const only = typeof args.client === 'string' ? args.client : undefined;
  const id = typeof args.id === 'string' ? args.id : undefined;
  const due = args.due === true;
  // 시뮬레이션(dry-run)일 땐 플랜 상태를 변경하지 않는다(가짜 '발행됨' 방지).
  const dryRun = process.env.PSLAB_DRY_RUN !== 'false';

  const repo = process.env.PSLAB_REPO ?? 'leejiho-pslab/pslab';
  const [owner, repoName] = repo.split('/');
  const pages = process.env.PSLAB_PAGES_BASE ?? `https://${owner}.github.io/${repoName}`;

  if (!id && !due) {
    console.error('--id <항목ID> 또는 --due (예정시각 지난 항목) 중 하나가 필요합니다.');
    process.exitCode = 1;
    return;
  }

  const clients = loadClients(dir).filter((c) => !only || c.id === only);
  const store = new PlanStore(dataDir);
  const notifier = createNotifier();
  const now = Date.now();

  for (const client of clients) {
    const plan = store.load(client.id);
    const targets = plan.items.filter((it) => {
      if (it.status === 'published') return false;
      if (id) return it.id === id;
      // --due: 예정시각이 지난 항목 (이미 수동발행 처리된 건 제외)
      if (it.status === 'manual') return false;
      return new Date(it.scheduledFor).getTime() <= now;
    });
    if (targets.length === 0) {
      console.log(`  ${client.name}: 발행할 항목 없음`);
      continue;
    }
    for (const it of targets) {
      // 수동 채널(네이버블로그·유튜브)만으로 된 항목은 자동 발행하지 않고
      // "수동 발행 대기"로 표시한다 (대시보드에서 복사해 직접 게시).
      if (isManualOnly(it.channels)) {
        if (!dryRun) it.status = 'manual';
        console.log(
          `\n📋 수동 발행 대기: [${it.channels.join(',')}] ${it.topic} — 대시보드에서 복사해 직접 게시`,
        );
        continue;
      }
      // 자동 채널만 추려 발행 (수동 채널이 섞여 있으면 제외)
      const autoChannels = it.channels.filter((c) => !MANUAL_CHANNELS.includes(c));
      const includesYoutube = autoChannels.includes('youtube');
      const imgs = it.slideImages?.length
        ? it.slideImages
        : it.cardImage
          ? [it.cardImage]
          : [];
      // 유튜브 쇼츠 항목은 카드 이미지가 아니라 영상 파일로 발행하므로 이미지가 없어도 통과.
      if (imgs.length === 0 && !(includesYoutube && it.videoFile)) {
        console.log(`  ${it.id}: 카드 이미지 없음 → 건너뜀`);
        continue;
      }
      // 유튜브는 SEO용 별도 제목/설명/태그(ytTitle 등)가 있으면 그것을 우선 사용.
      const title = includesYoutube && it.ytTitle
        ? it.ytTitle
        : (it.headline ?? it.topic).replace(/<br>/g, ' ').replace(/\*/g, '');
      const body = includesYoutube && it.ytDescription
        ? it.ytDescription
        : (it.captionBody ?? it.captionNote ?? it.topic);
      const media: PostContent['media'] = imgs.map((p) => ({
        kind: 'image' as const,
        source: `${pages}/${p}`,
        alt: it.topic,
      }));
      if (includesYoutube && it.videoFile) {
        // 영상은 공개 URL이 아니라 CI 작업 디렉터리의 로컬 파일을 직접 읽어 업로드한다
        // (Pages 배포 반영 지연에 의존하지 않기 위함 — docs/는 같은 체크아웃에 이미 존재).
        media.push({ kind: 'video' as const, source: `docs/${it.videoFile}` });
      }
      const content: PostContent = {
        id: it.id,
        title,
        body,
        media,
        tags: includesYoutube && it.ytTags?.length ? it.ytTags : [],
      };
      // 자격 증명이 아예 없는 채널(의도적 미연결)은 조용히 건너뛴다.
      // 자격 증명이 "있는데" 발행이 실패하면(토큰 만료 등) 아래에서 즉시 알림.
      const configured = autoChannels.filter(
        (c) => Object.keys(loadCredentials(c)).length > 0,
      );
      const unconfigured = autoChannels.filter((c) => !configured.includes(c));
      if (unconfigured.length > 0) {
        console.log(`  (자격 증명 미설정 채널 대기: ${unconfigured.join(',')} — ${it.id})`);
      }
      if (configured.length === 0) continue;

      console.log(`\n▶ 발행: [${configured.join(',')}] ${content.title} (${imgs.length}장)`);
      const alertTitle = (it.headline ?? it.topic).replace(/<br>/g, ' ').replace(/\*/g, '');
      // 한 항목 발행 실패가 나머지 항목 발행을 막지 않도록 격리
      let result;
      try {
        result = await app.publisher.publish(content, { targets: configured });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ⚠️ ${it.id} 발행 건너뜀 (${msg})`);
        // 조용한 실패 방지: 실제 발행 모드에선 실패도 즉시 푸시 (내일까지 모르는 사태 차단)
        if (!dryRun) {
          await notifier.send(
            `🔴 <b>발행 실패</b> [${it.id}]\n${escHtml(alertTitle)}\n${escHtml(msg)}\n👉 대시보드 토큰 경고를 확인하세요.`,
          );
        }
        continue;
      }
      printResults(`📤 ${it.id}`, result.results);
      if (dryRun) {
        console.log('  (시뮬레이션 — 플랜 상태는 변경하지 않음)');
        continue;
      }
      const okResults = result.results.filter((r) => r.ok && r.remoteId);
      const failed = result.results.filter((r) => !r.ok);
      // 채널별 실패는 성공 여부와 무관하게 즉시 푸시 — "발행이 멈췄다"를 며칠 뒤에 아는 사태 방지
      if (failed.length > 0) {
        const lines = failed
          .map((f) => `· ${f.platform}: ${escHtml(f.error ?? '알 수 없는 오류')}`)
          .join('\n');
        await notifier.send(
          `🔴 <b>발행 실패</b> [${it.id}] ${failed.map((f) => f.platform).join(',')}\n${escHtml(alertTitle)}\n${lines}\n👉 대시보드 토큰 경고를 확인하세요.`,
        );
      }
      if (okResults.length > 0) {
        it.status = 'published';
        it.publishedUrl = okResults[0].url;
        it.publishedAt = new Date().toISOString();
        // 성과 수집용으로 채널별 remoteId를 보관 (학습 루프의 입력)
        it.published = okResults.map((r) => ({
          platform: r.platform,
          remoteId: r.remoteId!,
          url: r.url,
        }));
        // 발행 후 푸시 알림 (텔레그램) — 설정 없으면 자동 생략
        const chs = okResults.map((r) => r.platform).join(', ');
        const link = okResults[0].url ? `\n🔗 ${okResults[0].url}` : '';
        const pushed = await notifier.send(
          `✅ <b>발행 완료</b> [${chs}]\n${escHtml(alertTitle)}${link}`,
        );
        if (pushed) console.log('  📲 텔레그램 알림 전송');
      }
    }
    store.save(client.id, plan);
  }
}

async function cmdCollectInsights(app: App, args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const only = typeof args.client === 'string' ? args.client : undefined;

  const clients = loadClients(dir).filter((c) => !only || c.id === only);
  const store = new PlanStore(dataDir);
  const learnStore = new LearningStore(dataDir);
  const engine = new LearningEngine();

  for (const client of clients) {
    const plan = store.load(client.id);
    const published = plan.items.filter(
      (it) => it.status === 'published' && it.published?.length,
    );
    console.log(`\n📈 성과 수집 — ${client.name} (발행 ${published.length}건)`);

    for (const it of published) {
      let views = 0, likes = 0, comments = 0, shares = 0, erSum = 0, erN = 0;
      let any = false;
      for (const pub of it.published!) {
        const plugin = app.registry.all().find((p) => p.platform === pub.platform);
        if (!plugin || !plugin.isConnected()) continue;
        try {
          const rep = await plugin.fetchAnalytics(pub.remoteId);
          const m = rep.metrics;
          views += m.views ?? 0;
          likes += m.likes ?? 0;
          comments += m.comments ?? 0;
          shares += m.shares ?? 0;
          if (typeof m.engagementRate === 'number') { erSum += m.engagementRate; erN++; }
          any = true;
        } catch (err) {
          console.log(`  ${it.id}/${pub.platform}: 수집 실패 (${err instanceof Error ? err.message : err})`);
        }
      }
      if (any) {
        it.metrics = {
          views, likes, comments, shares,
          engagementRate: erN > 0 ? erSum / erN : views > 0 ? (likes + comments) / views : 0,
        };
        it.metricsAt = new Date().toISOString();
        console.log(`  ${it.id}: 👁 ${views} ❤ ${likes} 💬 ${comments} (참여율 ${((it.metrics.engagementRate ?? 0) * 100).toFixed(1)}%)`);
      }
    }
    store.save(client.id, plan);

    // 학습 요약 갱신 (다음 기획 생성·대시보드가 읽음)
    const summary = engine.summarize(plan);
    learnStore.save(client.id, summary);
    console.log(`  🧠 학습 갱신: 표본 ${summary.sampleSize}건` + (summary.bestVariant ? `, 우세 디자인 ${summary.bestVariant}안` : ''));
    for (const h of summary.hints) console.log(`     · ${h}`);

    // 인사이트 코멘트 — 성과를 본 후 콘텐츠 디벨롭 방향 (AI 우선, 규칙 폴백)
    for (const it of published) {
      if (!it.metrics) continue;
      it.insightComment = await makeInsightComment(client, it, summary);
      it.insightAt = new Date().toISOString();
    }
    store.save(client.id, plan);
    console.log(`  💬 인사이트 코멘트 ${published.filter((it) => it.insightComment).length}건 작성`);
  }
}

async function cmdCheckTokens(args: Args): Promise<void> {
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const only = typeof args.client === 'string' ? args.client : 'pslab';
  const store = new TokenHealthStore(dataDir);
  const prev = store.load(only);
  const health = await checkTokens();
  store.save(only, health);
  console.log('\n🔑 토큰 상태 점검');
  for (const t of health.tokens) {
    const icon = t.ok ? (t.warn ? '🟡' : '🟢') : '🔴';
    const exp = t.expiresInDays != null ? ` (만료 ${t.expiresInDays}일 후)` : '';
    console.log(`  ${icon} ${t.label.padEnd(12)} ${t.ok ? '정상' : '오류'}${exp} ${t.detail ?? ''}`);
  }
  // 조기 경보: "새로" 생긴 경고만 텔레그램 푸시 (같은 경고 반복 스팸 방지,
  // 대시보드 배너는 경고가 사라질 때까지 계속 표시됨)
  const prevWarned = new Set(
    (prev?.tokens ?? []).filter((t) => t.warn || !t.ok).map((t) => t.label),
  );
  const newWarns = health.tokens.filter((t) => (t.warn || !t.ok) && !prevWarned.has(t.label));
  if (newWarns.length > 0) {
    const notifier = createNotifier();
    const lines = newWarns
      .map((t) => `· ${t.label}: ${escHtml(t.detail ?? '확인 필요')}`)
      .join('\n');
    const pushed = await notifier.send(
      `🟡 <b>토큰 경고</b> — 자동발행이 곧 멈출 수 있어요\n${lines}\n👉 새 토큰 발급 후 GitHub 시크릿을 교체하면 자동 복구됩니다.`,
    );
    if (pushed) console.log('  📲 토큰 경고 텔레그램 전송');
  }
}

async function cmdWeeklyReport(args: Args): Promise<void> {
  const dir = typeof args['clients-dir'] === 'string' ? args['clients-dir'] : './clients';
  const dataDir = typeof args['data-dir'] === 'string' ? args['data-dir'] : './data/clients';
  const only = typeof args.client === 'string' ? args.client : undefined;
  // --no-push 면 푸시 생략 (대시보드만 갱신)
  const noPush = args.push === false || args['no-push'] === true;

  const clients = loadClients(dir).filter((c) => !only || c.id === only);
  const store = new PlanStore(dataDir);
  const learnStore = new LearningStore(dataDir);
  const reportStore = new WeeklyReportStore(dataDir);
  const engine = new WeeklyReportEngine();
  const notifier = createNotifier();
  const now = new Date();

  for (const client of clients) {
    const plan = store.load(client.id);
    const learning = learnStore.load(client.id);
    const report = await engine.build(client, plan, learning, now);
    console.log(`\n📅 주간 리포트 — ${client.name} (${report.weekOf} 주, 발행 ${report.postsCount}건)`);
    console.log(`  ${report.summary}`);
    for (const r of report.recommendations) console.log(`  → ${r}`);

    // 같은 주에 이미 푸시했으면 중복 전송 생략 (cron이 하루 2회 도는 멱등 처리)
    const prev = reportStore.latest(client.id);
    const alreadyPushed = prev?.weekOf === report.weekOf && Boolean(prev?.pushedAt);
    if (!noPush && !alreadyPushed && report.postsCount > 0) {
      const chLines = report.channels
        .map((c) => `· ${c.label}: ${c.posts}건, 참여율 ${(c.avgEngagement * 100).toFixed(1)}%`)
        .join('\n');
      const recLines = report.recommendations.map((r) => `• ${r}`).join('\n');
      const top = report.top ? `\n🏆 최고: [${report.top.label}] ${report.top.title} (${(report.top.engagementRate * 100).toFixed(1)}%)` : '';
      const ok = await notifier.send(
        `📅 <b>주간 리포트</b> (${report.weekOf} 주)\n발행 ${report.postsCount}건\n\n${report.summary}\n\n${chLines}${top}\n\n<b>다음 주</b>\n${recLines}`,
      );
      if (ok) {
        report.pushedAt = new Date().toISOString();
        console.log('  📲 텔레그램 주간 리포트 전송');
      }
    } else if (alreadyPushed) {
      report.pushedAt = prev!.pushedAt; // 이미 보낸 주 — 상태 유지
    }
    reportStore.save(client.id, report);
  }
}

async function cmdNotifyTest(args: Args): Promise<void> {
  const msg =
    typeof args.message === 'string'
      ? args.message
      : '🔔 <b>pslab 알림 테스트</b>\n텔레그램 연결이 정상입니다. 앞으로 발행 완료·주간 리포트가 여기로 옵니다.';
  const notifier = createNotifier();
  if (!notifier.enabled()) {
    console.log('❌ 텔레그램 미설정 — TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 시크릿을 확인하세요.');
    process.exitCode = 1;
    return;
  }
  const ok = await notifier.send(msg);
  if (ok) {
    console.log('✅ 텔레그램 테스트 메시지 전송 성공 — 휴대폰을 확인하세요.');
  } else {
    console.log('❌ 전송 실패 — 봇에게 먼저 말을 걸었는지(START), 토큰/chat id가 맞는지 확인하세요.');
    process.exitCode = 1;
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
      '  publish-plan          승인된 기획안 발행 (--id <항목> | --due, 카드는 Pages URL 사용)',
      '  collect-insights      발행물 성과 수집 + 인사이트 코멘트 + 자체 학습 갱신',
      '  check-tokens          SNS 토큰 상태·만료 점검 (만료 전 경고)',
      '  weekly-report         주간 종합 평가 리포트 생성 + 텔레그램 푸시 (--no-push)',
      '  notify-test           텔레그램 연결 테스트 메시지 전송',
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
    case 'publish-plan':
      await cmdPublishPlan(app, args);
      break;
    case 'collect-insights':
      await cmdCollectInsights(app, args);
      break;
    case 'check-tokens':
      await cmdCheckTokens(args);
      break;
    case 'weekly-report':
      await cmdWeeklyReport(args);
      break;
    case 'notify-test':
      await cmdNotifyTest(args);
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
