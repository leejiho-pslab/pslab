/**
 * 오토파일럿 데모 (설계도 "둥근 벨트" 한 바퀴)
 *
 * 시장조사 → 제작 → 검수 → 발행 → 성적표 → AI 회의 → 강화 까지
 * 한 클라이언트에 대해 사이클을 두 번 돌려 본다.
 * 두 번째 사이클은 첫 번째 성과를 강화 신호로 활용한다.
 *
 *   npm run autopilot
 *
 * 자격 증명 없이 동작하도록 데모 자격 증명을 직접 주입한다.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApp,
  createAutopilot,
  normalizeClientConfig,
  Council,
} from '../src/index.js';
import type { PlatformId, PluginCredentials } from '../src/index.js';

const demoCreds: Partial<Record<PlatformId, PluginCredentials>> = {
  'naver-blog': { clientId: 'd', clientSecret: 'd', accessToken: 'd', blogId: 'pslab' },
  instagram: { accessToken: 'd', igUserId: 'pslab.ig' },
  threads: { accessToken: 'd', threadsUserId: 'pslab.threads' },
};

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pslab-autopilot-'));
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(demoCreds);

  // 검수 스위치를 auto로 둔 클라이언트 (100% 자동 데모)
  const client = normalizeClientConfig({
    id: 'demo-cafe',
    name: '데모 디저트카페',
    industry: '디저트 카페',
    keywords: ['신메뉴', '딸기케이크', '시즌음료', '카페추천'],
    competitors: [{ handle: 'rival.cafe' }, { handle: 'topdessert' }],
    brandTone: '친근하고 따뜻하게',
    bannedWords: ['최저가'],
    targets: ['instagram', 'threads', 'naver-blog'],
    reviewMode: 'auto',
  });

  const auto = createAutopilot({ app, dataDir });

  for (const round of [1, 2]) {
    console.log(`\n================ 사이클 ${round} ================`);
    const rec = await auto.orchestrator.runCycle(client);
    console.log(`주제      : ${rec.topic} (${rec.suggestedFormat})`);
    console.log(`검수      : ${rec.review.reviewer} → ${rec.review.approved ? '승인✅' : '보류'}`);
    if (rec.publishSummary)
      console.log(`발행      : ${rec.publishSummary.ok}/${rec.publishSummary.total} 채널`);
    console.log(`평균 참여율: ${(rec.avgEngagementRate * 100).toFixed(1)}%`);
    console.log(`다음 방향  : ${rec.direction.focusTopics.join(', ')} / ${rec.direction.focusFormats.join(', ')}`);
  }

  // 마지막 사이클의 AI 회의 전문 출력
  const last = auto.store.read(client.id).at(-1)!;
  console.log('\n' + '※ 강화 확인: 2번째 사이클은 1번째 성과 좋은 주제를 우선 고려합니다.');
  console.log(`누적 사이클 이력: ${auto.store.read(client.id).length}건 (격리 저장소: ${dataDir}/${client.id})`);
  void Council; // 회의 포맷터는 라이브러리로 제공 (Council.format)
  void last;

  app.scheduler.shutdown();
  rmSync(dataDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
