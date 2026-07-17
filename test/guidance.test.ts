import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GuidanceStore,
  parseGuideBody,
  brandNotesText,
  BRAND_FIELDS,
} from '../src/core/guidance.js';

test('지침: 이슈 본문에서 주제 줄과 가이드를 분리한다', () => {
  const { topics, guide } = parseGuideBody(
    '주제: 청담 데이트, 와인 페어링, 브런치\n\n톤은 차분하게.\n이모지는 최소로.',
  );
  assert.deepEqual(topics, ['청담 데이트', '와인 페어링', '브런치']);
  assert.ok(guide.includes('톤은 차분하게.'));
  assert.ok(!guide.includes('주제:'));
});

test('지침: 주제 줄이 없으면 전체가 가이드', () => {
  const { topics, guide } = parseGuideBody('그냥 가이드만 있는 본문');
  assert.equal(topics.length, 0);
  assert.equal(guide, '그냥 가이드만 있는 본문');
});

test('지침: 브랜드 노트 필드 매핑(분석/방향성/감도)', () => {
  assert.equal(BRAND_FIELDS['분석'], 'analysis');
  assert.equal(BRAND_FIELDS['방향성'], 'direction');
  assert.equal(BRAND_FIELDS['감도'], 'sensibility');
});

test('지침 저장소: 브랜드 노트 갱신·이력, 채널 가이드 병합 저장', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guid-'));
  try {
    const store = new GuidanceStore(dir);
    // 브랜드 노트
    store.updateBriefField('c1', 'analysis', '청담 최장수 브라세리');
    const b = store.updateBriefField('c1', 'sensibility', '웜톤, 과장 없이');
    assert.equal(b.analysis, '청담 최장수 브라세리');
    assert.equal(b.sensibility, '웜톤, 과장 없이');
    assert.equal(b.log?.length, 2);
    assert.equal(b.log?.[0].field, 'sensibility');
    // 프롬프트 텍스트
    const txt = brandNotesText(b)!;
    assert.ok(txt.includes('브랜드 분석'));
    assert.ok(txt.includes('웜톤'));
    // 채널 가이드 — 새 주제 없이 가이드만 갱신하면 기존 주제 유지
    store.updateGuide('c1', 'instagram', { topics: ['a', 'b'], guide: 'v1' });
    const g2 = store.updateGuide('c1', 'instagram', { topics: [], guide: 'v2' });
    assert.deepEqual(g2.instagram?.topics, ['a', 'b']);
    assert.equal(g2.instagram?.guide, 'v2');
    // 파일 재로드 일치
    const re = new GuidanceStore(dir);
    assert.equal(re.loadBrief('c1').analysis, '청담 최장수 브라세리');
    assert.equal(re.loadGuides('c1').instagram?.guide, 'v2');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('지침: 빈 저장소는 빈 객체를 돌려준다(크래시 없음)', () => {
  const store = new GuidanceStore('/nonexistent-dir-xyz');
  assert.deepEqual(store.loadBrief('nope'), {});
  assert.deepEqual(store.loadGuides('nope'), {});
  assert.equal(brandNotesText(undefined), undefined);
  assert.equal(brandNotesText({}), undefined);
});
