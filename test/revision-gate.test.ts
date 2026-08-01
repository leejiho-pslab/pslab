import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRevisionIssue,
  holdsForItem,
  shouldNotifyHold,
  HOLD_RENOTIFY_MS,
} from '../src/core/revision-gate.js';
import type { PlatformId } from '../src/core/types.js';

test('게이트: [수정요청·채널] 제목 + (id:)·업체: 본문 파싱', () => {
  const req = parseRevisionIssue({
    title: '[수정요청·instagram] [이미지] 커버 톤을 밝게',
    body: '업체: vittz\n채널: 인스타그램\n대상 콘텐츠: 08/03 · 실링팬 (id: plan-abc.1)\n수정 항목: 이미지(사진·카드)',
    html_url: 'https://github.com/x/y/issues/9',
    number: 9,
  });
  assert.ok(req);
  assert.equal(req.chKey, 'instagram');
  assert.equal(req.planId, 'plan-abc.1');
  assert.equal(req.clientId, 'vittz');
  assert.equal(req.number, 9);
});

test('게이트: 규약 밖 제목·PR은 무시, id/업체 없는 본문은 채널 공통·전 업체', () => {
  assert.equal(parseRevisionIssue({ title: '[가이드·instagram] 소재', body: '' }), null);
  assert.equal(
    parseRevisionIssue({ title: '[수정요청·instagram] x', body: '', pull_request: {} }),
    null,
  );
  const common = parseRevisionIssue({ title: '[수정요청·naver-blog] 톤 조정', body: '내용만' });
  assert.ok(common);
  assert.equal(common.chKey, 'naver-blog');
  assert.equal(common.planId, null);
  assert.equal(common.clientId, null);
});

test('게이트: id 지정=그 콘텐츠만, 채널 공통=채널 전체, 업체 스코프 격리', () => {
  const reqs = [
    parseRevisionIssue({ title: '[수정요청·instagram] 공통', body: '' })!,
    parseRevisionIssue({
      title: '[수정요청·instagram] 특정',
      body: '업체: vittz\n(id: plan-abc)',
    })!,
    parseRevisionIssue({ title: '[수정요청·youtube] 타업체', body: '업체: pslab' })!,
  ];
  const ch = (s: string[]) => s as PlatformId[];
  // 특정 id 항목: 공통(1) + 특정(2) 모두 걸림
  assert.deepEqual(
    holdsForItem('vittz', { id: 'plan-abc', channels: ch(['instagram']) }, reqs).map((r) => r.number),
    [0, 0],
  );
  // 같은 채널의 다른 항목: 공통(1)만
  assert.equal(holdsForItem('vittz', { id: 'plan-xyz', channels: ch(['instagram']) }, reqs).length, 1);
  // 타 업체 스코프 요청은 이 업체를 잡지 않는다
  assert.equal(holdsForItem('vittz', { id: 'plan-yt', channels: ch(['youtube']) }, reqs).length, 0);
  assert.equal(holdsForItem('pslab', { id: 'plan-yt', channels: ch(['youtube']) }, reqs).length, 1);
});

test('게이트: 보류 알림은 1회 + 72시간 후 재알림', () => {
  const now = Date.parse('2026-08-01T09:00:00Z');
  assert.equal(shouldNotifyHold(undefined, now), true);
  assert.equal(shouldNotifyHold(new Date(now - 60_000).toISOString(), now), false);
  assert.equal(shouldNotifyHold(new Date(now - HOLD_RENOTIFY_MS - 1).toISOString(), now), true);
  assert.equal(shouldNotifyHold('not-a-date', now), true);
});
