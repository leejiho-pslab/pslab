import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, Analytics } from '../src/index.js';
import type { PlatformId, PluginCredentials } from '../src/core/types.js';

const creds: Partial<Record<PlatformId, PluginCredentials>> = {
  instagram: { accessToken: 'x', igUserId: 'u' },
  threads: { accessToken: 'x', threadsUserId: 'u' },
  linkedin: { accessToken: 'x', authorUrn: 'urn:li:person:u' },
};

test('레지스트리: 자격 증명이 있는 플랫폼만 연결된다', async () => {
  const app = createApp({ dryRun: true });
  const statuses = await app.registry.connectAll(creds);
  assert.equal(statuses.length, 3);
  assert.ok(statuses.every((s) => s.connected));
  // youtube/naver-blog 는 자격 증명이 없어 미연결
  assert.equal(app.registry.connected().length, 3);
});

test('연결 실패: 자격 증명 누락 시 connected=false', async () => {
  const app = createApp({ dryRun: true });
  const [status] = await app.registry.connectAll({
    instagram: { accessToken: 'only-token' }, // igUserId 누락
  });
  assert.equal(status.connected, false);
  assert.match(status.detail ?? '', /igUserId/);
});

test('검증: Instagram은 미디어가 없으면 발행 실패', async () => {
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(creds);
  const result = await app.publisher.publish(
    { body: '미디어 없는 글', tags: ['t'] },
    { targets: ['instagram'] },
  );
  const ig = result.results.find((r) => r.platform === 'instagram');
  assert.equal(ig?.ok, false);
  assert.match(ig?.error ?? '', /이미지 또는 동영상/);
});

test('검증: Threads 글자 수 초과 시 실패', async () => {
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(creds);
  const result = await app.publisher.publish(
    { body: 'a'.repeat(600) },
    { targets: ['threads'] },
  );
  const th = result.results.find((r) => r.platform === 'threads');
  assert.equal(th?.ok, false);
});

test('멀티채널 발행: 일부 실패해도 나머지는 성공한다', async () => {
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(creds);
  const result = await app.publisher.publish(
    {
      body: '짧은 텍스트',
      media: [{ kind: 'image', source: 'pic.png' }],
    },
    { targets: ['instagram', 'threads', 'linkedin'] },
  );
  assert.equal(result.results.length, 3);
  const ok = result.results.filter((r) => r.ok);
  assert.ok(ok.length >= 2);
});

test('분석: 발행 결과로부터 집계 리포트를 만든다', async () => {
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(creds);
  const pub = await app.publisher.publish(
    { body: '본문', media: [{ kind: 'image', source: 'p.png' }] },
    { targets: ['instagram', 'linkedin'] },
  );
  const tracked = Analytics.fromPublishResults(pub.results);
  const report = await app.analytics.collect(tracked);
  assert.ok(report.totals.views > 0);
  assert.equal(report.reports.length, tracked.length);
});

test('스케줄러: 과거 시각은 즉시 실행되어 완료된다', async () => {
  const app = createApp({ dryRun: true });
  await app.registry.connectAll(creds);
  const done = new Promise<void>((resolve) => {
    const sched = app.scheduler;
    const job = sched.schedule(
      { body: 'x', media: [{ kind: 'image', source: 'p.png' }] },
      new Date(Date.now() - 1000),
      { targets: ['linkedin'] },
    );
    const check = setInterval(() => {
      const j = sched.get(job.id);
      if (j && (j.status === 'done' || j.status === 'failed')) {
        clearInterval(check);
        assert.equal(j.status, 'done');
        resolve();
      }
    }, 20);
  });
  await done;
  app.scheduler.shutdown();
});
