#!/usr/bin/env node
/**
 * 블로그 본문 실사 사진 수집 (힉스필드 생성물 → docs/blog/<postId>/)
 *
 * 왜 따로 있나:
 *   render-blog-images.mjs 는 **도표**(통계·체크리스트·비교)를 HTML→Chromium 으로 그린다.
 *   그것만으로는 글이 딱딱하다. 네이버 블로그는 실사 사진이 섞여야 체류시간이 붙는다.
 *   그래서 힉스필드(soul_2)로 뽑은 장면 사진을 본문 사이사이에 넣는다.
 *
 * 개발환경은 외부 호스트를 직접 못 여는 경우가 있어(egress 정책), 세션에서 **생성만** 하고
 * URL 을 blog-photos.json 에 적어두면 **CI 가 받아서** 저장한다. 다운로드는 curl 우선
 * (node fetch 는 HTTPS_PROXY 를 무시한다 — lib/download.mjs 참고).
 *
 * ⛔ AI 가짜 글자 주의: 종이·화면·간판이 프레임에 있으면 모델이 깨진 글자를 그려 넣는다.
 *    프롬프트에서 종이·모니터·폰을 아예 배제하고, 뽑은 뒤 **눈으로 확인**하고 등록할 것.
 *    (→ adr/0004-ai-가짜글자-함정-회피.md)
 *
 * 사용: node scripts/fetch-blog-photos.mjs --client pslab [--force]
 */
import { readFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { download } from './lib/download.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const clientId = arg('client', 'pslab');
const force = Boolean(arg('force', false));

const seedPath = join(ROOT, 'data/clients', clientId, 'blog-photos.json');
if (!existsSync(seedPath)) {
  console.log(`blog-photos.json 없음 — 건너뜀 (${seedPath})`);
  process.exit(0);
}
const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const posts = seed.posts ?? {};

// 힉스필드 원본은 2048px PNG(약 3MB)다. 네이버 본문 폭은 넉넉히 잡아도 900px이라
// 그대로 커밋하면 저장소만 무거워진다(주 2편 × 3장이면 한 달에 60MB). 1600px JPEG로 줄인다.
const MAX_W = 1600;
function shrink(file) {
  const before = statSync(file).size;
  const tmp = file + '.tmp.jpg';
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file,
      '-vf', `scale='min(${MAX_W},iw)':-2`, '-q:v', '4', tmp], { stdio: 'pipe' });
  } catch {
    // ffmpeg 이 없거나 실패하면 원본을 그대로 쓴다 — 사진이 없는 것보단 무거운 게 낫다.
    try { rmSync(tmp, { force: true }); } catch { /* keep */ }
    return null;
  }
  const after = statSync(tmp).size;
  execFileSync('mv', [tmp, file]);
  return { before, after };
}

let got = 0;
let kept = 0;
const failed = [];

for (const [postId, photos] of Object.entries(posts)) {
  const dir = join(ROOT, 'docs/blog', postId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  for (const p of photos) {
    const out = join(dir, p.file);
    if (!force && existsSync(out)) {
      kept++;
      continue;
    }
    try {
      await download(p.url, out);
      const s = shrink(out);
      got++;
      console.log(`  ✓ ${postId}/${p.file}` +
        (s ? ` (${Math.round(s.before / 1024)}KB → ${Math.round(s.after / 1024)}KB)` : ' (원본 유지 — ffmpeg 없음)'));
    } catch (err) {
      // 사진 한 장 실패로 파이프라인 전체를 세우지 않는다 — 나머지는 계속 받는다.
      failed.push(`${postId}/${p.file}: ${err instanceof Error ? err.message : err}`);
      console.warn(`  ✗ ${postId}/${p.file} — ${err instanceof Error ? err.message : err}`);
    }
  }
}

console.log(`블로그 사진 ${got}장 수집(${kept}장 기존 유지) → docs/blog/`);
if (failed.length) {
  // 조용한 실패 금지 — 몇 장이 빠졌는지 로그에 남긴다(본문에는 자리 표시가 남아 있다).
  console.warn(`⚠ ${failed.length}장 실패:\n  ${failed.join('\n  ')}`);
}
