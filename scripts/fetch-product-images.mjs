#!/usr/bin/env node
/**
 * 제품 이미지 CI 다운로더 — 지침⑥(콘텐츠의 50% 이상 제품 이미지) 실현 장치
 *
 * data/clients/<id>/product-images.json 의 제품 이미지 URL을
 * docs/products/<id>/<key>.jpg 로 내려받는다.
 * 개발 컨테이너는 외부 이미지 호스트가 막혀 있으므로 **CI(GitHub Actions)에서만** 실동작 —
 * 로컬에선 실패해도 조용히 건너뛴다(기존 커밋 이미지 유지, CI를 깨지 않음).
 *
 * 사용: node scripts/fetch-product-images.mjs --client vittz [--force]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'vittz');
const force = process.argv.includes('--force');

const specPath = join(ROOT, 'data/clients', clientId, 'product-images.json');
if (!existsSync(specPath)) { console.log(`제품 시드 없음: ${specPath} — 건너뜀`); process.exit(0); }
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const outDir = join(ROOT, 'docs/products', clientId);
mkdirSync(outDir, { recursive: true });

let ok = 0, skip = 0, fail = 0;
for (const p of spec.products || []) {
  const out = join(outDir, `${p.key}.jpg`);
  if (!force && existsSync(out)) { skip++; continue; }
  try {
    const res = await fetch(p.image, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pslab-sns)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) throw new Error('응답이 이미지가 아님');
    writeFileSync(out, buf);
    console.log(`  ✓ ${p.key} (${Math.round(buf.length / 1024)}KB) — ${p.name}`);
    ok++;
  } catch (err) {
    console.log(`  ✗ ${p.key} — ${err.message} (개발 환경이면 정상, CI에서 채워짐)`);
    fail++;
  }
}
console.log(`제품 이미지: ${ok}개 다운로드 · ${skip}개 보유 · ${fail}개 실패 → docs/products/${clientId}/`);
