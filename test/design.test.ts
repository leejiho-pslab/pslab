import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DesignStudio,
  DesignStore,
  defaultDesignStyle,
  createMediaProvider,
} from '../src/index.js';

test('디자인 프롬프트: 주제·스타일·톤이 모두 들어간다', () => {
  const studio = new DesignStudio();
  const style = defaultDesignStyle();
  const prompt = studio.buildPrompt({
    topic: '온라인마케팅 인사이트',
    format: '짧은 영상',
    brandTone: '전문적이고 진솔하게',
    style,
  });
  assert.match(prompt, /온라인마케팅 인사이트/);
  assert.match(prompt, /전문적이고 진솔하게/);
  assert.match(prompt, /썸네일/); // 영상 형식 힌트
  assert.ok(prompt.includes(style.palette));
});

test('디자인 진화: 회의 피드백이 메모로 누적된다', () => {
  const studio = new DesignStudio();
  const s0 = defaultDesignStyle();
  const s1 = studio.evolve(s0, {
    designNotes: ['썸네일 대비를 높이자'],
    engagement: 0.1,
  });
  assert.equal(s1.version, s0.version + 1);
  assert.ok(s1.notes.includes('썸네일 대비를 높이자'));
});

test('디자인 진화: 참여율 하락이 2회 누적되면 구도를 바꾼다(탐색)', () => {
  const studio = new DesignStudio();
  let s = defaultDesignStyle();
  const before = s.composition;
  // 1회 하락 → 아직 유지
  s = studio.evolve(s, { designNotes: [], engagement: 0.05, prevEngagement: 0.1 });
  assert.equal(s.composition, before);
  // 2회 연속 하락 → 구도 변경
  s = studio.evolve(s, { designNotes: [], engagement: 0.02, prevEngagement: 0.05 });
  assert.notEqual(s.composition, before);
});

test('디자인 진화: 참여율 상승이면 현재 방향 유지', () => {
  const studio = new DesignStudio();
  let s = defaultDesignStyle();
  const before = s.composition;
  s = studio.evolve(s, { designNotes: [], engagement: 0.2, prevEngagement: 0.1 });
  assert.equal(s.composition, before);
  assert.equal(s.declineStreak, 0);
});

test('디자인 저장소: 클라이언트별로 스타일을 보관한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pslab-design-'));
  try {
    const store = new DesignStore(dir);
    // 없으면 기본 스타일
    assert.equal(store.load('c1').version, 1);
    const evolved = { ...defaultDesignStyle(), version: 5 };
    store.save('c1', evolved);
    assert.equal(store.load('c1').version, 5);
    assert.equal(store.load('c2').version, 1); // 격리
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('이미지 프로바이더: 키 없으면 undefined (플레이스홀더 폴백)', () => {
  const prevG = process.env.GEMINI_API_KEY;
  const prevB = process.env.IMGBB_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.IMGBB_API_KEY;
  try {
    assert.equal(createMediaProvider(), undefined);
  } finally {
    if (prevG !== undefined) process.env.GEMINI_API_KEY = prevG;
    if (prevB !== undefined) process.env.IMGBB_API_KEY = prevB;
  }
});
