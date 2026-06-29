import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BloggerPlugin, markdownToHtml } from '../src/index.js';

test('markdownToHtml: 소제목/인용/굵게/문단 변환', () => {
  const md = [
    '# 광고 예산 배분',
    '> [핵심 요약] 70-20-10으로 나누세요.',
    '',
    '제가 **직접** 운영하며 배운 건,',
    '한 줄로 줄이면 이것입니다.',
    '',
    '## 70은 검증된 채널',
    '여기에 대부분을 씁니다.',
    '🔖 태그: #광고예산 #배분',
  ].join('\n');
  const html = markdownToHtml(md, '광고 예산 배분');
  assert.ok(!html.includes('# 광고 예산 배분')); // 제목 줄 제거
  assert.match(html, /<blockquote>.*핵심 요약/);
  assert.match(html, /<h2>70은 검증된 채널<\/h2>/);
  assert.match(html, /<strong>직접<\/strong>/);
  assert.match(html, /<p>.*🔖 태그/);
  assert.match(html, /<br\/>/); // 같은 문단 줄바꿈
});

test('markdownToHtml: HTML 특수문자 이스케이프', () => {
  const html = markdownToHtml('a < b & c > d', '제목');
  assert.ok(html.includes('&lt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&gt;'));
});

test('Blogger 플러그인: 제목 없으면 검증 실패', () => {
  const p = new BloggerPlugin({ dryRun: true });
  const errs = p.validate({ body: '본문' });
  assert.ok(errs.some((e) => e.includes('제목')));
  const ok = p.validate({ title: '제목', body: '본문' });
  assert.equal(ok.length, 0);
});

test('Blogger 플러그인: dryRun 발행 시뮬레이션', async () => {
  const p = new BloggerPlugin({ dryRun: true });
  await p.connect({ clientId: 'a', clientSecret: 'b', refreshToken: 'c', blogId: 'd' });
  const res = await p.publish({ title: '제목', body: '본문' });
  assert.equal(res.ok, true);
  assert.equal(res.platform, 'blogger');
  assert.ok(res.remoteId);
});
