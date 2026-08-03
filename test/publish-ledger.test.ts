import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLedger,
  saveLedger,
  alreadyPublished,
  recordPublish,
} from '../src/core/publish-ledger.js';

const withDir = (fn: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('없는 원장은 빈 객체로 읽힌다 (첫 실행에서 터지지 않아야 한다)', () => {
  withDir((dir) => {
    assert.deepEqual(loadLedger(dir, 'acme'), {});
  });
});

test('기록 → 저장 → 재로드 왕복', () => {
  withDir((dir) => {
    const led = recordPublish({}, 'reels-07-31', [
      { platform: 'instagram', remoteId: 'IG1', url: 'https://x/1' },
    ]);
    saveLedger(dir, 'acme', led);
    const back = loadLedger(dir, 'acme');
    assert.ok(alreadyPublished(back, 'reels-07-31'));
    assert.deepEqual(back['reels-07-31'].channels, ['instagram']);
    assert.equal(back['reels-07-31'].refs[0].remoteId, 'IG1');
  });
});

test('★ 중복 발행 사고 재현 — plan 상태가 되돌아가도 원장은 발행 사실을 기억한다', () => {
  // 2026-07-31: CI 가 published 로 기록 → 세션이 오래된 plan.json 을 커밋해 planned 로 롤백
  //             → 크론이 "예정시각 지났는데 planned" 로 보고 재발행 → 인스타·유튜브 중복
  const led = recordPublish({}, 'reels-07-31', [
    { platform: 'instagram', remoteId: 'IG1' },
  ]);
  // plan.json 이 통째로 되돌아간 상황을 흉내 — 원장은 별도 파일이라 영향받지 않는다
  const planItem = { id: 'reels-07-31', status: 'planned' as const };
  assert.equal(planItem.status, 'planned');
  assert.ok(
    alreadyPublished(led, planItem.id),
    'status 가 planned 로 되돌아가도 원장은 발행됨으로 답해야 한다',
  );
});

test('같은 항목 재기록 — 최초 시각은 보존하고 채널만 합친다', () => {
  const led = recordPublish({}, 'car-08-05', [{ platform: 'instagram', remoteId: 'IG1' }]);
  const first = led['car-08-05'].firstPublishedAt;
  recordPublish(led, 'car-08-05', [{ platform: 'threads', remoteId: 'TH1' }]);
  assert.equal(led['car-08-05'].firstPublishedAt, first, '최초 발행 시각은 덮어쓰지 않는다');
  assert.deepEqual(led['car-08-05'].channels.sort(), ['instagram', 'threads']);
  assert.equal(led['car-08-05'].refs.length, 2);
});

test('같은 platform+remoteId 를 다시 기록해도 중복 항목이 생기지 않는다', () => {
  const led = recordPublish({}, 'x', [{ platform: 'instagram', remoteId: 'IG1' }]);
  recordPublish(led, 'x', [{ platform: 'instagram', remoteId: 'IG1' }]);
  assert.equal(led['x'].refs.length, 1);
});

test('원장이 깨져 있어도 발행을 막지 않는다 (빈 원장으로 진행)', () => {
  withDir((dir) => {
    mkdirSync(join(dir, 'acme'), { recursive: true });
    writeFileSync(join(dir, 'acme', 'published-ledger.json'), '{ 이건 JSON 이 아니다');
    assert.deepEqual(loadLedger(dir, 'acme'), {});
  });
});

test('저장 시 키가 정렬된다 (병합 diff 가독성)', () => {
  withDir((dir) => {
    let led = recordPublish({}, 'zeta', [{ platform: 'instagram', remoteId: '1' }]);
    led = recordPublish(led, 'alpha', [{ platform: 'instagram', remoteId: '2' }]);
    saveLedger(dir, 'acme', led);
    const raw = readFileSync(join(dir, 'acme', 'published-ledger.json'), 'utf8');
    assert.ok(raw.indexOf('"alpha"') < raw.indexOf('"zeta"'));
  });
});
