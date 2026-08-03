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

// ── 이미지 출처 제한 (운영자 지시): 해당 프로젝트(업체) 영역의 호스트에서만 다운로드 ──
// 허용 목록은 clients/<id>.json 의 imageAllowlist (단일 출처). 없으면 다운로드 자체를 거부해
// 무관한 외부 이미지가 파이프라인에 섞이는 것을 원천 차단한다.
function loadAllowlist() {
  try {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'clients', `${clientId}.json`), 'utf8'));
    return Array.isArray(cfg.imageAllowlist) ? cfg.imageAllowlist.map((d) => String(d).toLowerCase()) : [];
  } catch { return []; }
}
const ALLOW = loadAllowlist();
function allowed(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOW.some((d) => host === d || host.endsWith(`.${d}`));
  } catch { return false; }
}
if (!ALLOW.length) {
  console.error(`imageAllowlist가 비어 있습니다 — clients/${clientId}.json 에 허용 도메인을 등록하세요. 전체 건너뜀.`);
  process.exit(0);
}
console.log(`허용 도메인: ${ALLOW.join(', ')}`);

let ok = 0, skip = 0, fail = 0;
for (const p of spec.products || []) {
  // 다중 컷 지원 — images[](여러 컷) 또는 image(단일). 파일명: <key>.jpg, <key>-2.jpg, <key>-3.jpg…
  // (운영자 지침: 한 콘텐츠에서 같은 제품 이미지를 반복 사용하지 않는다 — 장마다 다른 컷)
  const urls = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const out = join(outDir, i === 0 ? `${p.key}.jpg` : `${p.key}-${i + 1}.jpg`);
    if (!force && existsSync(out)) { skip++; continue; }
    if (!allowed(url)) {
      console.log(`  ⛔ ${p.key}#${i + 1} — 허용 도메인 밖(${String(url).slice(0, 60)}…) → 차단`);
      fail++;
      continue;
    }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pslab-sns)' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000) throw new Error('응답이 이미지가 아님');
      writeFileSync(out, buf);
      console.log(`  ✓ ${p.key}#${i + 1} (${Math.round(buf.length / 1024)}KB) — ${p.name}`);
      ok++;
    } catch (err) {
      console.log(`  ✗ ${p.key}#${i + 1} — ${err.message} (개발 환경이면 정상, CI에서 채워짐)`);
      fail++;
    }
  }
}
console.log(`제품 이미지: ${ok}개 다운로드 · ${skip}개 보유 · ${fail}개 실패 → docs/products/${clientId}/`);
