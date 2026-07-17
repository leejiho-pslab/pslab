import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextProvider, ClaudeTextProvider } from '../src/index.js';

test('프로바이더: ANTHROPIC_API_KEY 없으면 undefined (템플릿 폴백)', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert.equal(createTextProvider(), undefined);
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('프로바이더: 키가 있으면 Claude 프로바이더를 반환', () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
  try {
    const p = createTextProvider();
    assert.ok(p instanceof ClaudeTextProvider);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('ClaudeTextProvider: SDK 미설치/오류 시 템플릿으로 폴백한다', async () => {
  // @anthropic-ai/sdk 가 설치돼 있지 않으므로 동적 import 가 실패 → 폴백 경로 검증
  const p = new ClaudeTextProvider({ apiKey: 'sk-test-not-real' });
  const out = await p.generate({
    topic: '온라인마케팅 인사이트',
    tone: '전문적으로',
    keyPoints: ['핵심1', '핵심2'],
  });
  assert.equal(out.title, '온라인마케팅 인사이트');
  assert.ok(out.body.includes('온라인마케팅 인사이트'));
  assert.ok(out.tags.length > 0);
});
