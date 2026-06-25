import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApp,
  createAutopilot,
  AutomationDaemon,
  normalizeClientConfig,
} from '../src/index.js';
import type { PlatformId, PluginCredentials, ClientConfig } from '../src/index.js';

const creds: Partial<Record<PlatformId, PluginCredentials>> = {
  instagram: { accessToken: 'x', igUserId: 'u' },
};

function makeClient(times: string[]): ClientConfig {
  return normalizeClientConfig({
    id: 'daemon-cafe',
    name: '데몬 카페',
    industry: '카페',
    keywords: ['신메뉴', '시즌음료'],
    competitors: [{ handle: 'rival' }],
    targets: ['instagram'],
    scheduleTimes: times,
    reviewMode: 'auto',
  });
}

async function setup(times: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-daemon-'));
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(creds);
  const auto = createAutopilot({ app, dataDir: dir });
  const client = makeClient(times);
  return { dir, app, auto, client };
}

test('데몬 tick: 예약 시각에만 사이클이 돈다', async () => {
  const { dir, app, auto, client } = await setup(['11:00']);
  try {
    const daemon = new AutomationDaemon(auto.orchestrator, [client]);
    // 11:00 에 실행됨
    const at1100 = new Date(2026, 5, 24, 11, 0, 0);
    const ran = await daemon.tick(at1100);
    assert.deepEqual(ran, ['daemon-cafe']);
    assert.equal(auto.store.read('daemon-cafe').length, 1);

    // 10:30 에는 실행 안 됨
    const at1030 = new Date(2026, 5, 24, 10, 30, 0);
    const ran2 = await daemon.tick(at1030);
    assert.deepEqual(ran2, []);
    assert.equal(auto.store.read('daemon-cafe').length, 1);

    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('데몬 tick: 같은 분에 중복 실행되지 않는다', async () => {
  const { dir, app, auto, client } = await setup(['19:00']);
  try {
    const daemon = new AutomationDaemon(auto.orchestrator, [client]);
    const at = new Date(2026, 5, 24, 19, 0, 5);
    await daemon.tick(at);
    await daemon.tick(new Date(2026, 5, 24, 19, 0, 40)); // 같은 분 재점검
    assert.equal(auto.store.read('daemon-cafe').length, 1); // 1회만
    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('데몬 runOnce: 모든 클라이언트를 즉시 한 사이클', async () => {
  const { dir, app, auto, client } = await setup(['11:00', '19:00']);
  try {
    const daemon = new AutomationDaemon(auto.orchestrator, [client]);
    await daemon.runOnce();
    assert.equal(auto.store.read('daemon-cafe').length, 1);
    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('데몬: 사이클이 실패해도 데몬은 죽지 않고 알림을 보낸다', async () => {
  const { dir, app, auto, client } = await setup(['11:00']);
  try {
    // orchestrator.runCycle 가 던지도록 조작
    const broken = {
      runCycle: async () => {
        throw new Error('의도된 실패');
      },
    } as unknown as typeof auto.orchestrator;

    let alerted = false;
    auto.alerts.addSink({
      async send(a) {
        if (a.level === 'error') alerted = true;
      },
    });

    const daemon = new AutomationDaemon(broken, [client], { alerts: auto.alerts });
    const ran = await daemon.tick(new Date(2026, 5, 24, 11, 0, 0));
    assert.deepEqual(ran, ['daemon-cafe']); // 시도는 함
    assert.equal(alerted, true); // 실패 알림 발송
    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
