import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LearningEngine, LearningStore, isManualOnly, MANUAL_CHANNELS } from '../src/index.js';
import type { ContentPlan, PlanItem } from '../src/index.js';

function item(p: Partial<PlanItem>): PlanItem {
  return {
    id: p.id ?? 'x',
    topic: p.topic ?? '소재',
    format: 'card',
    channels: p.channels ?? ['instagram'],
    scheduledFor: p.scheduledFor ?? '2026-07-01T10:00:00.000Z',
    score: 80,
    status: p.status ?? 'published',
    ...p,
  } as PlanItem;
}

test('학습: 디자인 변형별 우세안을 참여율로 가린다', () => {
  const plan: ContentPlan = {
    updatedAt: new Date().toISOString(),
    items: [
      item({ id: 'a1', variant: 'A', metrics: { engagementRate: 0.10, likes: 100 }, publishedAt: '2026-07-01T19:00:00.000Z' }),
      item({ id: 'a2', variant: 'A', metrics: { engagementRate: 0.12, likes: 120 }, publishedAt: '2026-07-03T19:00:00.000Z' }),
      item({ id: 'b1', variant: 'B', metrics: { engagementRate: 0.04, likes: 30 }, publishedAt: '2026-07-02T11:00:00.000Z' }),
    ],
  };
  const sum = new LearningEngine().summarize(plan);
  assert.equal(sum.sampleSize, 3);
  assert.equal(sum.bestVariant, 'A'); // A 평균 참여율이 더 높음
  assert.ok(sum.variants[0].avgEngagement > sum.variants[1].avgEngagement);
  assert.ok(sum.hints.some((h) => h.includes('A안')));
});

test('학습: 성과 미수집(metrics 없음) 항목은 표본에서 제외', () => {
  const plan: ContentPlan = {
    updatedAt: new Date().toISOString(),
    items: [
      item({ id: 'p1', status: 'published' }), // metrics 없음
      item({ id: 'p2', status: 'planned', metrics: { engagementRate: 0.2 } }), // 발행 전
    ],
  };
  const sum = new LearningEngine().summarize(plan);
  assert.equal(sum.sampleSize, 0);
  assert.equal(sum.bestVariant, undefined);
});

test('학습: 저장소 왕복', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-learn-'));
  try {
    const store = new LearningStore(dir);
    assert.equal(store.load('c1'), undefined);
    const sum = new LearningEngine().summarize({ updatedAt: '', items: [] });
    store.save('c1', sum);
    const back = store.load('c1');
    assert.ok(back);
    assert.equal(back!.sampleSize, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('수동 채널: 네이버블로그·유튜브만이면 수동 발행 대상', () => {
  assert.ok(isManualOnly(['naver-blog']));
  assert.ok(isManualOnly(['naver-blog', 'youtube']));
  assert.ok(!isManualOnly(['instagram']));
  assert.ok(!isManualOnly(['naver-blog', 'instagram'])); // 자동 채널 섞이면 자동 처리
  assert.deepEqual(MANUAL_CHANNELS, ['naver-blog', 'youtube']);
});
