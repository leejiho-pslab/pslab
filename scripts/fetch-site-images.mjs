#!/usr/bin/env node
/**
 * 공식 사이트 이미지 수집기 — "해당 프로젝트 영역에서만" 받도록 도메인·경로를 강제한다.
 *
 * 제한(커스텀 규칙):
 *  1) data/clients/<id>/site-images.json 의 allowedHosts 에 있는 호스트만 접근한다.
 *     (대구일색 = daeguis.co.kr — 그 외 URL은 페이지든 이미지든 무조건 거부·기록)
 *  2) 결과물은 docs/site-assets/<id>/ 아래에만 저장한다 (다른 업체 폴더와 격리).
 *  3) https만 허용, 이미지 최대 40장·장당 8MB 제한.
 *
 * 동작:
 *  - manifest.pages 를 (허용 호스트 검증 후) 가져와 <img src>·CSS url()·같은 호스트 <a href="*.html">
 *    1단계 링크에서 이미지 URL을 수집하고, manifest.images 의 수동 지정분과 합쳐 다운로드한다.
 *  - 개발 컨테이너는 외부 접근이 막혀 있으므로 실동작은 CI(GitHub Actions)에서만 —
 *    로컬 실패는 조용히 건너뛴다(기존 커밋 이미지 유지). (스킬 §8 / docs/02 규칙)
 *  - 다운로드 성공분은 manifest.downloaded 에 { key, url, file } 로 기록해
 *    렌더러·기획이 로컬 경로(site-assets/<id>/…)만 참조하게 한다.
 *
 * 사용: node scripts/fetch-site-images.mjs --client daeguis [--force]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'daeguis');
const force = process.argv.includes('--force');

const specPath = join(ROOT, 'data/clients', clientId, 'site-images.json');
if (!existsSync(specPath)) { console.log(`사이트 이미지 시드 없음: ${specPath} — 건너뜀`); process.exit(0); }
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const allowed = (spec.allowedHosts || []).map((h) => h.toLowerCase());
if (!allowed.length) { console.error('allowedHosts 가 비어 있음 — 프로젝트 영역 제한이 없으면 실행하지 않는다.'); process.exit(1); }

const MAX_IMAGES = spec.maxImages ?? 40;
const MAX_BYTES = 8 * 1024 * 1024;
const outDir = join(ROOT, 'docs/site-assets', clientId);
mkdirSync(outDir, { recursive: true });

const rejected = [];
function inScope(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    return allowed.includes(url.hostname.toLowerCase());
  } catch { return false; }
}
function guard(u, kind) {
  if (inScope(u)) return true;
  rejected.push(`${kind}: ${u}`);
  return false;
}

async function get(u, asText) {
  const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pslab-sns)' }, signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  // 리다이렉트로 영역 밖 호스트에 도달한 경우도 차단
  if (!inScope(res.url)) throw new Error(`영역 밖 리다이렉트: ${res.url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

const IMG_EXT = /\.(jpe?g|png|webp|gif)(\?|$)/i;
function extractUrls(html, base) {
  const found = new Set();
  const push = (raw) => {
    if (!raw) return;
    try {
      const abs = new URL(raw.trim().replace(/^['"]|['"]$/g, ''), base).href;
      found.add(abs);
    } catch { /* 무시 */ }
  };
  for (const m of html.matchAll(/<img[^>]+src=["']?([^"'\s>]+)/gi)) push(m[1]);
  for (const m of html.matchAll(/url\(([^)]+)\)/gi)) push(m[1]);
  for (const m of html.matchAll(/<a[^>]+href=["']?([^"'\s>]+\.html?)["'\s>]/gi)) push(m[1]);
  return [...found];
}

function keyFor(u) {
  const p = new URL(u).pathname.replace(/\.[a-z]+$/i, '');
  return p.split('/').filter(Boolean).join('-').replace(/[^a-zA-Z0-9가-힣_-]/g, '').slice(-60) || 'img';
}

// 1) 페이지 크롤 (허용 호스트만, 1단계 링크까지)
const pageQueue = (spec.pages || []).filter((p) => guard(p, '페이지'));
const visited = new Set();
const imageUrls = new Map(); // url -> key
for (const it of spec.images || []) if (guard(it.url, '수동 이미지')) imageUrls.set(it.url, it.key || keyFor(it.url));

let crawlOk = true;
for (let depth = 0; depth < 2 && pageQueue.length; depth++) {
  const batch = pageQueue.splice(0);
  for (const page of batch) {
    if (visited.has(page)) continue;
    visited.add(page);
    try {
      const html = await get(page, true);
      for (const u of extractUrls(html, page)) {
        if (!inScope(u)) { rejected.push(`발견: ${u}`); continue; }
        if (IMG_EXT.test(u)) { if (imageUrls.size < MAX_IMAGES) imageUrls.set(u, imageUrls.get(u) || keyFor(u)); }
        else if (depth === 0 && /\.html?$/i.test(new URL(u).pathname) && !visited.has(u)) pageQueue.push(u);
      }
      console.log(`  ⛏ 크롤: ${page} (누적 이미지 ${imageUrls.size})`);
    } catch (err) {
      crawlOk = false;
      console.log(`  ✗ 크롤 실패: ${page} — ${err.message} (개발 환경이면 정상, CI에서 수행)`);
    }
  }
}

// 2) 이미지 다운로드 (허용 호스트만)
let ok = 0, skip = 0, fail = 0;
const downloaded = [...(spec.downloaded || [])];
const have = new Set(downloaded.map((d) => d.url));
for (const [u, key] of imageUrls) {
  const ext = (extname(new URL(u).pathname) || '.jpg').toLowerCase();
  const file = `${key}${ext}`;
  const out = join(outDir, file);
  if (!force && (existsSync(out) || have.has(u))) { skip++; continue; }
  try {
    const buf = await get(u, false);
    if (buf.length < 1000) throw new Error('이미지가 아님');
    if (buf.length > MAX_BYTES) throw new Error('8MB 초과');
    writeFileSync(out, buf);
    downloaded.push({ key, url: u, file: `site-assets/${clientId}/${file}` });
    have.add(u);
    console.log(`  ✓ ${file} (${Math.round(buf.length / 1024)}KB)`);
    ok++;
  } catch (err) {
    console.log(`  ✗ ${file} — ${err.message}`);
    fail++;
  }
}

spec.downloaded = downloaded;
spec.lastRunAt = new Date().toISOString();
writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');
if (rejected.length) console.log(`\n🚫 영역 밖이라 거부한 URL ${rejected.length}건 (allowedHosts=${allowed.join(',')})\n   ` + rejected.slice(0, 10).join('\n   '));
console.log(`\n사이트 이미지: ${ok}개 다운로드 · ${skip}개 보유 · ${fail}개 실패 → docs/site-assets/${clientId}/`);
if (!crawlOk && ok === 0) console.log('ℹ 개발 환경에서는 네트워크가 막혀 있습니다 — CI 워크플로(daeguis-assets)에서 실행하세요.');
