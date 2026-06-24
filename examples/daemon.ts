/**
 * 무인 데몬 라이브 데모.
 *
 * 현재 시각(HH:mm)을 발행 시간표로 가진 클라이언트를 만들고,
 * 데몬을 0.5초 간격 점검으로 가동한다. 정해진 분이 되면 사람이 아무것도
 * 하지 않아도 사이클이 "스스로" 한 바퀴 돈다.
 *
 *   npm run daemon-demo
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApp,
  createAutopilot,
  AutomationDaemon,
  normalizeClientConfig,
} from '../src/index.js';
import type { PlatformId, PluginCredentials } from '../src/index.js';

const demoCreds: Partial<Record<PlatformId, PluginCredentials>> = {
  instagram: { accessToken: 'demo', igUserId: '_pslab' },
};

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pslab-daemon-demo-'));
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(demoCreds);
  const auto = createAutopilot({ app, dataDir });

  const now = hhmm(new Date());
  const client = normalizeClientConfig({
    id: 'pslab',
    name: '_pslab (라이브 데모)',
    industry: '온라인 컨설팅·광고대행 인사이트',
    keywords: ['온라인마케팅', '마케팅인사이트', '퍼포먼스마케팅'],
    competitors: [{ handle: '3dragon_pd' }, { handle: 'mindsseett' }],
    targets: ['instagram'],
    scheduleTimes: [now], // 지금 이 분에 발행하도록 예약
    reviewMode: 'rules',
  });

  const daemon = new AutomationDaemon(auto.orchestrator, [client], {
    intervalMs: 500,
    alerts: auto.alerts,
    onCycle: (id, ok) =>
      console.log(`\n✨ [${id}] 데몬이 스스로 한 사이클 실행 — 발행: ${ok ? '성공' : '안함'}`),
  });

  console.log(`🟢 관리인 가동 — "${client.name}" 발행 예약: ${now} (지금)`);
  console.log('   (사람은 아무것도 누르지 않습니다. 데몬이 알아서 발화합니다)\n');
  daemon.start();

  // 발화 확인까지 잠깐 대기
  await new Promise((r) => setTimeout(r, 2000));
  daemon.stop();

  const history = auto.store.read('pslab');
  console.log(`\n결과: 누적 사이클 ${history.length}건`);
  if (history.length > 0) {
    const last = history.at(-1)!;
    console.log(`  주제: ${last.topic} (${last.suggestedFormat})`);
    console.log(`  다음 방향: ${last.direction.focusTopics.join(', ')}`);
  }

  app.scheduler.shutdown();
  rmSync(dataDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
