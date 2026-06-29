import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  WeeklyReportEngine,
  WeeklyReportStore,
  mondayOf,
  TelegramNotifier,
  ruleComment,
  normalizeClientConfig,
} from '../src/index.js';
import type { ContentPlan, PlanItem, ClientConfig } from '../src/index.js';

const client: ClientConfig = normalizeClientConfig({
  id: 'pslab',
  name: '_pslab',
  industry: '마케팅',
  brandTone: '진솔',
  keywords: ['광고'],
  targets: ['instagram'],
  reviewMode: 'manual',
  scheduleTimes: ['19:00'],
  competitors: [],
  bannedWords: [],
});

function item(p: Partial<PlanItem>): PlanItem {
  return {
    id: p.id ?? 'x', topic: p.topic ?? '소재', format: 'card',
    channels: p.channels ?? ['instagram'], scheduledFor: '2026-06-22T10:00:00.000Z',
    score: 80, status: p.status ?? 'published', ...p,
  } as PlanItem;
}

test('mondayOf: 임의 요일 → 그 주 월요일', () => {
  // 2026-06-24 는 수요일 → 월요일은 2026-06-22
  const mon = mondayOf(new Date(2026, 5, 24, 15, 0));
  assert.equal(mon.getFullYear(), 2026);
  assert.equal(mon.getMonth(), 5);
  assert.equal(mon.getDate(), 22);
  assert.equal(mon.getDay(), 1); // 월요일
});

test('주간 리포트: 지난주 발행물만 집계하고 최고/최저를 가린다', async () => {
  // now = 2026-06-29(월) → 지난주 범위 2026-06-22 ~ 06-29
  const now = new Date(2026, 5, 29, 11, 0);
  const plan: ContentPlan = {
    updatedAt: now.toISOString(),
    items: [
      item({ id: 'a', headline: '잘된 글', publishedAt: '2026-06-23T19:00:00.000Z', metrics: { engagementRate: 0.12, likes: 120, views: 1000 } }),
      item({ id: 'b', headline: '약한 글', publishedAt: '2026-06-25T19:00:00.000Z', metrics: { engagementRate: 0.03, likes: 20, views: 900 } }),
      item({ id: 'old', headline: '지지난주', publishedAt: '2026-06-10T19:00:00.000Z', metrics: { engagementRate: 0.5 } }),
      item({ id: 'plan', headline: '발행전', status: 'planned' }),
    ],
  };
  const report = await new WeeklyReportEngine().build(client, plan, undefined, now);
  assert.equal(report.postsCount, 2); // old/plan 제외
  assert.equal(report.top?.id, 'a');
  assert.equal(report.worst?.id, 'b');
  assert.equal(report.channels[0].channel, 'instagram');
  assert.ok(report.summary.length > 0);
  assert.ok(report.recommendations.length > 0);
});

test('주간 리포트 저장소: 같은 주는 교체, 최신이 앞', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-wk-'));
  try {
    const store = new WeeklyReportStore(dir);
    assert.equal(store.latest('pslab'), undefined);
    store.save('pslab', { weekOf: '2026-06-22', generatedAt: '', range: { from: '', to: '' }, postsCount: 1, channels: [], summary: 's', recommendations: [] });
    store.save('pslab', { weekOf: '2026-06-22', generatedAt: '', range: { from: '', to: '' }, postsCount: 2, channels: [], summary: 's2', recommendations: [] });
    assert.equal(store.load('pslab').length, 1); // 교체
    assert.equal(store.latest('pslab')!.postsCount, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('텔레그램: 설정 없으면 비활성, send는 false', async () => {
  const n = new TelegramNotifier(undefined, undefined);
  assert.equal(n.enabled(), false);
  assert.equal(await n.send('hi'), false);
});

test('인사이트 규칙 코멘트: 평균 상회/하회를 구분', () => {
  const learning = { generatedAt: '', sampleSize: 2, variants: [{ key: 'A', posts: 2, avgEngagement: 0.05, avgLikes: 10, avgViews: 100 }], channels: [], hours: [], motifs: [], hints: [] };
  const hi = ruleComment(item({ metrics: { engagementRate: 0.10 } }), learning as any);
  assert.match(hi, /웃돌/);
  const lo = ruleComment(item({ metrics: { engagementRate: 0.01 } }), learning as any);
  assert.match(lo, /밑돌/);
});
