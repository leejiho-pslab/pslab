#!/usr/bin/env node
/**
 * 배경 사진 수집 — 인물·배경·상황 기반 이미지 (무료)
 *
 * 각 콘텐츠 항목마다 주제와 어울리는 장면 사진을 받아 docs/bg/<id>.jpg 로 저장한다.
 * 렌더러들이 이 사진을 카드/슬라이드 배경으로 깔고 그 위에 텍스트를 올린다.
 *
 * 소스 우선순위:
 *  1) Pexels (실사진, 무료 API 키 PEXELS_API_KEY) — 인물·상황 고품질
 *  2) Pollinations (무료 AI, 키 불필요) — 폴백
 * 둘 다 실패하면 건너뜀(텍스트 단색 배경 유지).
 *
 * 장면을 항목별로 회전시켜 인물/사무실/회의/노트북/도시 등 다양하게 한다.
 * 사용: node scripts/fetch-photos.mjs --client pslab [--force]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const clientId = arg('client', 'pslab');
const force = Boolean(arg('force', false));

// 비즈니스·마케팅 장면 (인물 + 배경 + 상황) — 항목별로 회전해 다양성 확보
const SCENES = [
  { q: 'small business owner laptop cafe', p: 'candid cinematic photo of a small business owner working on a laptop in a cozy cafe, warm window light, shallow depth of field, no text' },
  { q: 'marketing team meeting charts', p: 'photo of a marketing team meeting around a table reviewing charts, modern office, natural light, no text' },
  { q: 'analytics dashboard computer screen', p: 'close up photo of analytics graphs on a computer screen, hands on keyboard, office desk, bokeh, no text' },
  { q: 'entrepreneur thinking office window city', p: 'cinematic photo of an entrepreneur looking out an office window at a city skyline, thoughtful, golden hour, no text' },
  { q: 'desk coffee notebook laptop workspace', p: 'flat lay photo of a tidy workspace with laptop, coffee, notebook and pen, soft daylight, no text' },
  { q: 'business handshake deal', p: 'photo of two professionals shaking hands closing a deal, bright office, no text' },
  { q: 'woman presenting whiteboard strategy', p: 'photo of a woman presenting a marketing strategy on a whiteboard, team listening, modern office, no text' },
  { q: 'startup team brainstorming sticky notes', p: 'photo of a startup team brainstorming with colorful sticky notes on a glass wall, energetic, no text' },
  { q: 'smartphone social media analytics hand', p: 'close up photo of a hand holding a smartphone showing social media analytics, cafe background, bokeh, no text' },
  { q: 'city business district skyline dusk', p: 'cinematic photo of a city business district skyline at dusk, warm lights, no text' },
  { q: 'focused man reviewing documents desk', p: 'photo of a focused man reviewing financial documents at a wooden desk, warm lamp light, no text' },
  { q: 'online shopping ecommerce laptop', p: 'photo of online shopping on a laptop, credit card and parcel on desk, bright, no text' },
];

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

async function fromPexels(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=portrait&size=large&per_page=10`;
    const res = await fetch(url, { headers: { Authorization: key } });
    const json = await res.json().catch(() => ({}));
    const photos = json.photos || [];
    if (!photos.length) return null;
    // 다양성: 결과 중 하나를 쿼리 해시로 골라 같은 쿼리도 다른 사진
    const pick = photos[hash(query) % photos.length];
    const src = pick.src?.portrait || pick.src?.large || pick.src?.original;
    if (!src) return null;
    const img = await fetch(src);
    if (!img.ok) return null;
    return Buffer.from(await img.arrayBuffer());
  } catch { return null; }
}

async function fromPollinations(prompt, seed) {
  try {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1350&nologo=true&seed=${seed}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

async function fromUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

// 미리 생성한 장면 이미지 URL 목록 (Higgsfield 등) — 있으면 최우선 사용
function loadSources() {
  const f = join(ROOT, 'data/clients', clientId, 'bg-sources.json');
  if (!existsSync(f)) return [];
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    return Array.isArray(j.urls) ? j.urls.filter((u) => typeof u === 'string' && /^https?:\/\//.test(u)) : [];
  } catch { return []; }
}

const FILE = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(FILE, 'utf8'));
const outDir = join(ROOT, 'docs/bg');
mkdirSync(outDir, { recursive: true });

const sources = loadSources();
const usePexels = Boolean(process.env.PEXELS_API_KEY);
console.log(
  `배경 사진 소스: ${sources.length ? `미리생성 ${sources.length}장(Higgsfield 등)` : usePexels ? 'Pexels(실사진)' : 'Pollinations(무료 AI)'}`,
);

let got = 0, skipped = 0;
for (const it of plan.items) {
  const out = join(outDir, `${it.id}.jpg`);
  if (existsSync(out) && !force) { skipped++; continue; }
  const scene = SCENES[hash(it.id) % SCENES.length];
  let buf = null, label = '';
  // 우선순위: 미리생성 장면 URL → Pexels → Pollinations
  if (sources.length) {
    buf = await fromUrl(sources[hash(it.id) % sources.length]);
    label = 'scene';
  }
  if (!buf) { buf = await fromPexels(scene.q); if (buf) label = scene.q.slice(0, 28); }
  if (!buf) { buf = await fromPollinations(scene.p, hash(it.id) % 100000); if (buf) label = scene.q.slice(0, 28); }
  if (buf && buf.length > 1000) {
    writeFileSync(out, buf);
    got++;
    console.log(`  ${it.id}: ${label} (${Math.round(buf.length / 1024)}KB)`);
  } else {
    console.log(`  ${it.id}: 사진 실패 → 단색 배경 유지`);
  }
}
console.log(`배경 사진 ${got}장 수집(${skipped}장 기존 유지) → docs/bg/`);
