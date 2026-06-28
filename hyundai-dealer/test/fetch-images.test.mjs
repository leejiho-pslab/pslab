import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extFor } from '../scripts/fetch-images.mjs';

test('extFor: content-type 우선', () => {
  assert.equal(extFor('https://x/a', 'image/png'), 'png');
  assert.equal(extFor('https://x/a', 'image/jpeg'), 'jpg');
  assert.equal(extFor('https://x/a', 'image/webp; charset=binary'), 'webp');
});

test('extFor: content-type 없으면 URL 확장자', () => {
  assert.equal(extFor('https://x/car.PNG'), 'png');
  assert.equal(extFor('https://x/car.jpeg?v=2'), 'jpg');
  assert.equal(extFor('https://x/car.webp'), 'webp');
});

test('extFor: 알 수 없으면 jpg 기본값', () => {
  assert.equal(extFor('https://x/image'), 'jpg');
  assert.equal(extFor('https://x/a', 'application/octet-stream'), 'jpg');
});
