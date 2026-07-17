import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApp,
  createAutopilot,
  StatusBoard,
  ClientStore,
  normalizeClientConfig,
} from '../src/index.js';
import type {
  PlatformId,
  PluginCredentials,
  ClientConfig,
  CycleRecord,
} from '../src/index.js';

const creds: Partial<Record<PlatformId, PluginCredentials>> = {
  instagram: { accessToken: 'x', igUserId: 'u' },
};

function client(id: string, reviewMode: 'auto' | 'manual'): ClientConfig {
  return normalizeClientConfig({
    id,
    name: `client ${id}`,
    industry: '카페',
    keywords: ['신메뉴', '시즌음료'],
    competitors: [{ handle: 'rival' }],
    targets: ['instagram'],
    reviewMode,
  });
}

test('상황판: 발행 사이클을 집계한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-board-'));
  try {
    const app = createApp({ dryRun: true });
    await app.registry.connectAll(creds);
    const auto = createAutopilot({ app, dataDir: dir });
    const c = client('auto-co', 'auto');

    await auto.orchestrator.runCycle(c);
    await auto.orchestrator.runCycle(c);

    const board = new StatusBoard(auto.store).build([c]);
    const row = board.rows[0];
    assert.equal(row.cycles, 2);
    assert.equal(row.published, 2);
    assert.equal(row.publishRate, 1);
    assert.ok(row.lastTopic);
    assert.equal(board.totals.cycles, 2);

    // 포맷 문자열이 깨지지 않고 생성된다
    const text = StatusBoard.format(board);
    assert.match(text, /상황판/);
    assert.match(text, /client auto-co/);

    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('상황판: manual 승인 대기를 카운트한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-board2-'));
  try {
    const app = createApp({ dryRun: true });
    await app.registry.connectAll(creds);
    const auto = createAutopilot({ app, dataDir: dir });
    const c = client('manual-co', 'manual');

    await auto.orchestrator.runCycle(c); // manual → 발행 안 됨, 승인 대기

    const board = new StatusBoard(auto.store).build([c]);
    const row = board.rows[0];
    assert.equal(row.published, 0);
    assert.equal(row.pendingApprovals, 1);
    assert.equal(board.totals.pendingApprovals, 1);

    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('상황판: 이력이 없으면 빈 보드를 만든다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-board3-'));
  try {
    const store = new ClientStore<CycleRecord>(dir);
    const board = new StatusBoard(store).build([client('empty-co', 'auto')]);
    assert.equal(board.rows[0].cycles, 0);
    assert.equal(board.rows[0].trend, 'n/a');
    assert.equal(board.totals.cycles, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
