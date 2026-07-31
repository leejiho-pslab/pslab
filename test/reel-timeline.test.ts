import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error — 렌더 스크립트와 공유하는 순수 JS 모듈 (타입 선언 없음)
import { buildTimeline, mergeTheme, segmentLine, secToFrames } from '../scripts/lib/reel-timeline.mjs';

const themes = mergeTheme(null);

const cfg = (overrides: Record<string, unknown> = {}) => ({
  theme: 'cinematic',
  beats: [
    { kicker: 'ALWAYS ON', text: '첫 줄\n둘째 줄', accent: '둘째', scene: '메모', clip: 'https://x/1.mp4' },
    { kicker: '', text: '셋째 줄', accent: '', scene: '', clip: 'https://x/2.mp4' },
  ],
  ...overrides,
});

const build = (overrides = {}, defaults = {}) =>
  buildTimeline({
    itemId: 'reels-test',
    cfg: cfg(overrides),
    defaults,
    themes,
    brand: '@_pslab',
    resolveClip: (_b: unknown, i: number) => `clips/reels-test/scene-${i + 1}.mp4`,
  });

test('segmentLine — 액센트를 앞/액센트/뒤 세 조각으로 자른다', () => {
  assert.deepEqual(segmentLine('손님 눈엔 닫힌 가게', '닫힌 가게'), [
    { text: '손님 눈엔 ', accent: false },
    { text: '닫힌 가게', accent: true },
  ]);
  assert.deepEqual(segmentLine('댓글에 "온" 주세요', '"온"'), [
    { text: '댓글에 ', accent: false },
    { text: '"온"', accent: true },
    { text: ' 주세요', accent: false },
  ]);
});

test('segmentLine — 그 줄에 액센트가 없으면 통째로 한 조각', () => {
  assert.deepEqual(segmentLine('첫 줄', '둘째'), [{ text: '첫 줄', accent: false }]);
  assert.deepEqual(segmentLine('첫 줄', ''), [{ text: '첫 줄', accent: false }]);
});

test('mergeTheme — design-tokens 값이 기본 팔레트를 덮어쓴다', () => {
  const merged = mergeTheme({ cinematic: { accent: '#123456' } });
  assert.equal(merged.cinematic.accent, '#123456');
  // 지정하지 않은 키는 기본값 유지
  assert.equal(merged.cinematic.kicker, themes.cinematic.kicker);
  // 건드리지 않은 테마도 그대로 남는다
  assert.deepEqual(merged.premium, themes.premium);
});

test('buildTimeline — 총 길이는 씬 합계에서 전환만큼 뺀 값', () => {
  const t = build({}, { beatSec: 3.5, xfade: 0.3 });
  const scene = secToFrames(3.5);
  const xf = secToFrames(0.3);
  assert.equal(t.scenes.length, 2);
  assert.equal(t.transitions.length, 1);
  assert.equal(t.durationInFrames, 2 * scene - 1 * xf);
});

test('buildTimeline — 클립이 2개 미만이면 합성 불가(null)', () => {
  assert.equal(build({ beats: [{ text: '한 줄', clip: 'https://x/1.mp4' }] }), null);
  // URL 이 아직 안 붙은 비트는 세지 않는다
  assert.equal(
    build({ beats: [{ text: 'a', clip: 'https://x/1.mp4' }, { text: 'b', clip: '' }] }),
    null,
  );
});

test('buildTimeline — 준비된 비트만 골라 씬 번호를 다시 매긴다', () => {
  const t = build({
    beats: [
      { text: 'a', clip: 'https://x/1.mp4' },
      { text: 'b', clip: '' }, // 아직 힉스필드 생성 전
      { text: 'c', clip: 'https://x/3.mp4' },
    ],
  });
  assert.equal(t.scenes.length, 2);
  assert.deepEqual(t.scenes.map((s: { index: number }) => s.index), [0, 1]);
  // resolveClip 은 걸러낸 뒤의 순번을 받는다 → 스테이징한 파일명과 어긋나지 않아야 한다
  assert.equal(t.scenes[1].clip.src, 'clips/reels-test/scene-2.mp4');
});

test('buildTimeline — 줄바꿈은 줄로, 액센트는 그 줄 안에서만 잡힌다', () => {
  const t = build();
  assert.deepEqual(t.scenes[0].lines, [
    [{ text: '첫 줄', accent: false }],
    [{ text: '둘째', accent: true }, { text: ' 줄', accent: false }],
  ]);
});

test('buildTimeline — 전환은 fade/slideup 을 번갈아 쓴다', () => {
  const t = build({
    beats: Array.from({ length: 4 }, (_, i) => ({ text: `줄${i}`, clip: `https://x/${i}.mp4` })),
  });
  assert.deepEqual(
    t.transitions.map((x: { type: string }) => x.type),
    ['fade', 'slideup', 'fade'],
  );
});
