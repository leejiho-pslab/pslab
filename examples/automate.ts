/**
 * 종단 간 데모: 생성 → 멀티채널 발행 → 예약 → 성과 리포트.
 *
 * 자격 증명 없이도 동작하도록, 데모 전용 가짜 자격 증명을 직접 주입한다.
 * 실제 사용 시에는 .env 에 자격 증명을 넣고 bootstrap()을 쓰면 된다.
 *
 *   npm run demo
 */
import { createApp, Analytics } from '../src/index.js';
import type { PlatformId, PluginCredentials } from '../src/core/types.js';

const demoCreds: Partial<Record<PlatformId, PluginCredentials>> = {
  youtube: {
    clientId: 'demo',
    clientSecret: 'demo',
    refreshToken: 'demo',
    channelId: 'pslab-channel',
  },
  'naver-blog': {
    clientId: 'demo',
    clientSecret: 'demo',
    accessToken: 'demo',
    blogId: 'pslab',
  },
  instagram: { accessToken: 'demo', igUserId: 'pslab.ig' },
  threads: { accessToken: 'demo', threadsUserId: 'pslab.threads' },
  linkedin: { accessToken: 'demo', authorUrn: 'urn:li:person:pslab' },
};

async function main(): Promise<void> {
  const app = createApp({ dryRun: true });

  console.log('=== 1) 플러그인 연결 ===');
  const statuses = await app.registry.connectAll(demoCreds);
  for (const s of statuses) {
    console.log(`  ${s.connected ? '🟢' : '⚪'} ${s.platform} → ${s.account ?? s.detail}`);
  }

  console.log('\n=== 2) 콘텐츠 생성 ===');
  const content = await app.content.generate({
    topic: 'pslab으로 시작하는 SNS 자동화',
    tone: '캐주얼',
    keyPoints: [
      '플러그인 하나로 5개 채널 동시 발행',
      '예약 발행과 성과 리포트까지',
    ],
    link: 'https://example.com/pslab',
    media: [{ kind: 'image', prompt: '미니멀한 자동화 대시보드 일러스트' }],
  });
  console.log(`  제목: ${content.title}`);
  console.log(`  태그: ${content.tags?.join(', ')}`);

  console.log('\n=== 3) 멀티채널 동시 발행 (Threads는 글자 수 검증 데모) ===');
  // 텍스트 전용 채널을 위해 미디어가 필요 없는 본문도 함께 시연
  const pub = await app.publisher.publish(content, {
    targets: ['instagram', 'threads', 'linkedin', 'naver-blog'],
  });
  for (const r of pub.results) {
    console.log(`  ${r.ok ? '✅' : '❌'} ${r.platform.padEnd(12)} ${r.url ?? r.error}`);
  }

  console.log('\n=== 4) 예약 발행 (2초 후) ===');
  await new Promise<void>((resolve) => {
    const sched = createApp({ dryRun: true });
    void sched.registry.connectAll(demoCreds).then(() => {
      sched.scheduler.schedule(
        { ...content, title: '[예약] ' + content.title },
        new Date(Date.now() + 2000),
        { targets: ['linkedin'] },
      );
    });
    // onComplete 콜백 대신 단순 대기
    setTimeout(() => {
      const jobs = sched.scheduler.list();
      for (const j of jobs) {
        console.log(`  작업 ${j.id}: ${j.status}`);
      }
      sched.scheduler.shutdown();
      resolve();
    }, 2500);
  });

  console.log('\n=== 5) 성과 리포트 ===');
  const tracked = Analytics.fromPublishResults(pub.results);
  const report = await app.analytics.collect(tracked);
  console.log(Analytics.format(report));

  app.scheduler.shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
