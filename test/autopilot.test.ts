import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createApp,
  createAutopilot,
  MarketResearch,
  ReviewGate,
  Council,
  CapabilityRegistry,
  ClientStore,
  validateClientConfig,
  normalizeClientConfig,
} from '../src/index.js';
import type {
  PlatformId,
  PluginCredentials,
  ClientConfig,
} from '../src/index.js';

const creds: Partial<Record<PlatformId, PluginCredentials>> = {
  instagram: { accessToken: 'x', igUserId: 'u' },
  threads: { accessToken: 'x', threadsUserId: 'u' },
  linkedin: { accessToken: 'x', authorUrn: 'urn:li:person:u' },
};

const sampleClient: ClientConfig = normalizeClientConfig({
  id: 'demo-cafe',
  name: 'OO카페',
  industry: '디저트 카페',
  keywords: ['신메뉴', '딸기케이크', '시즌음료'],
  competitors: [{ handle: 'rival.cafe' }, { handle: 'topdessert' }],
  brandTone: '친근하게',
  bannedWords: ['최저가'],
  targets: ['instagram', 'threads', 'linkedin'],
  scheduleTimes: ['11:00', '19:00'],
  reviewMode: 'auto',
});

test('시장조사: 소재 후보를 점수 내림차순으로 만든다', async () => {
  const mr = new MarketResearch();
  const res = await mr.investigate({
    industry: sampleClient.industry,
    keywords: sampleClient.keywords,
    competitors: sampleClient.competitors,
  });
  assert.ok(res.topicCandidates.length === sampleClient.keywords.length);
  for (let i = 1; i < res.topicCandidates.length; i++) {
    assert.ok(res.topicCandidates[i - 1].score >= res.topicCandidates[i].score);
  }
});

test('시장조사: 강화 신호가 해당 주제 점수를 끌어올린다', async () => {
  const mr = new MarketResearch();
  const base = await mr.investigate({
    industry: '카페',
    keywords: ['신메뉴', '딸기케이크'],
    competitors: [],
  });
  const boosted = await mr.investigate({
    industry: '카페',
    keywords: ['신메뉴', '딸기케이크'],
    competitors: [],
    reinforcement: { favoredTopics: ['딸기케이크'] },
  });
  const baseScore = base.topicCandidates.find((c) => c.topic === '딸기케이크')!.score;
  const boostScore = boosted.topicCandidates.find((c) => c.topic === '딸기케이크')!.score;
  assert.ok(boostScore > baseScore, `${boostScore} > ${baseScore}`);
});

test('검수 스위치: auto는 통과, rules는 금지어를 잡는다', () => {
  const auto = new ReviewGate({ mode: 'auto', bannedWords: ['최저가'] });
  assert.equal(auto.review({ body: '맛있는 신메뉴 출시!' }).approved, true);
  // 금지어는 auto에서도 안전장치로 막힌다
  assert.equal(auto.review({ body: '지금 최저가 행사' }).approved, false);

  const rules = new ReviewGate({ mode: 'rules', bannedWords: ['최저가'], minBodyLength: 5 });
  assert.equal(rules.review({ body: '충분히 긴 본문입니다' }).approved, true);
  assert.equal(rules.review({ body: '짧음' }).approved, false); // minBodyLength
});

test('검수 스위치: manual은 승인 대기, 스위치 전환이 동작한다', () => {
  const gate = new ReviewGate({ mode: 'manual' });
  const d = gate.review({ body: '검수 대기 콘텐츠' });
  assert.equal(d.approved, false);
  assert.equal(d.pending, true);
  const approved = gate.approveManually({ body: '검수 대기 콘텐츠' }, true);
  assert.equal(approved.approved, true);
  // 스위치를 auto로 끄면 바로 통과
  gate.setMode('auto');
  assert.equal(gate.review({ body: '아무 글' }).approved, true);
});

test('AI 회의: 어드바이저 발언과 다음 방향을 만든다', async () => {
  const mr = new MarketResearch();
  const research = await mr.investigate({
    industry: '카페',
    keywords: ['신메뉴', '딸기케이크'],
    competitors: [{ handle: 'rival' }],
  });
  const council = new Council();
  const dir = council.deliberate({
    research,
    report: {
      collectedAt: new Date().toISOString(),
      reports: [],
      totals: { views: 100, likes: 10, comments: 2, shares: 1, avgEngagementRate: 0.13 },
    },
  });
  assert.ok(dir.advices.length >= 3);
  assert.ok(dir.focusTopics.length > 0);
  assert.ok(dir.rationale.length > 0);
});

test('능력 레지스트리: 후보 발견→평가→승격, 상한 초과는 강등', async () => {
  const reg = new CapabilityRegistry({ promoteAtScore: 70, maxActivePerKind: 1 });
  await reg.discover([
    {
      async discover() {
        return [
          { id: 'img-a', kind: 'image', name: 'A', status: 'candidate' },
          { id: 'img-b', kind: 'image', name: 'B', status: 'candidate' },
        ];
      },
    },
  ]);
  reg.evaluate('img-a', 90);
  reg.evaluate('img-b', 80);
  reg.reconcile();
  const activeImages = reg.active('image');
  assert.equal(activeImages.length, 1); // 상한 1
  assert.equal(activeImages[0].id, 'img-a'); // 고점 유지
});

test('설정표: 유효성 검사와 기본값 채우기', () => {
  assert.ok(validateClientConfig({ id: 'x' }).length > 0); // 필수 누락
  const c = normalizeClientConfig({
    id: 'acme',
    name: 'Acme',
    industry: 'IT',
    keywords: ['ai'],
    targets: ['linkedin'],
    reviewMode: 'rules',
  });
  assert.deepEqual(c.scheduleTimes, ['11:00', '19:00']); // 기본값
  assert.equal(c.brandTone.length > 0, true);
});

test('격리 저장소: 클라이언트끼리 데이터가 섞이지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-store-'));
  try {
    const store = new ClientStore<{ topic: string }>(dir);
    store.append('clientA', { topic: 'A1' });
    store.append('clientB', { topic: 'B1' });
    store.append('clientA', { topic: 'A2' });
    assert.deepEqual(store.read('clientA').map((r) => r.topic), ['A1', 'A2']);
    assert.deepEqual(store.read('clientB').map((r) => r.topic), ['B1']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('오케스트레이터: 한 사이클이 발행·이력저장까지 완주한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-cycle-'));
  try {
    const app = createApp({ dryRun: true });
    await app.registry.connectAll(creds);
    const auto = createAutopilot({ app, dataDir: dir });

    const rec = await auto.orchestrator.runCycle(sampleClient);
    assert.equal(rec.published, true);
    assert.equal(rec.review.approved, true);
    assert.ok(rec.publishSummary!.ok >= 1);
    assert.ok(rec.avgEngagementRate > 0);

    // 이력이 격리 저장소에 쌓였는지
    assert.equal(auto.store.read(sampleClient.id).length, 1);

    // 두 번째 사이클: 이전 이력을 강화 신호로 사용해도 정상 완주
    const rec2 = await auto.orchestrator.runCycle(sampleClient);
    assert.equal(rec2.published, true);
    assert.equal(auto.store.read(sampleClient.id).length, 2);

    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('오케스트레이터: manual 모드면 발행하지 않고 승인 대기로 둔다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-manual-'));
  try {
    const app = createApp({ dryRun: true });
    await app.registry.connectAll(creds);
    const auto = createAutopilot({ app, dataDir: dir });
    const rec = await auto.orchestrator.runCycle({
      ...sampleClient,
      id: 'manual-cafe',
      reviewMode: 'manual',
    });
    assert.equal(rec.published, false);
    assert.equal(rec.review.pending, true);
    app.scheduler.shutdown();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
