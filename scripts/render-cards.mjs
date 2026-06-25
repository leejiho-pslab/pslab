#!/usr/bin/env node
/**
 * 매거진 카드 렌더러 (pslab 솔루션의 이미지 엔진)
 *
 * data/clients/<id>/plan.json 의 각 항목을 매거진 스타일 카드(PNG)로 렌더해
 * docs/cards/<id>/<itemId>.png 에 저장하고, plan.json 에 cardImage 경로를 채운다.
 *
 * AI 그림 생성(diffusion)은 한글 텍스트를 깨뜨리므로, 타이포그래피는 HTML/CSS로
 * 렌더링(헤드리스 Chromium)해 글자를 100% 선명하게 만든다. 인물 이미지 미사용.
 *
 * 사용: node scripts/render-cards.mjs --client pslab
 * Chromium 경로: PSLAB_CHROMIUM 환경변수 > /opt/pw-browsers/chromium > which chromium
 * Chromium이 없으면 렌더를 건너뛴다(기존 커밋된 카드 유지) — CI를 깨지 않음.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const clientId = arg('client', 'pslab');

function findChromium() {
  if (process.env.PSLAB_CHROMIUM && existsSync(process.env.PSLAB_CHROMIUM))
    return process.env.PSLAB_CHROMIUM;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', 'chrome']) {
    try {
      return execFileSync('which', [c], { encoding: 'utf8' }).trim();
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const FONT_WEIGHTS = { ExtraBold: 800, Bold: 700, SemiBold: 600, Medium: 500, Regular: 400 };
function fontFaces() {
  const dir = join(ROOT, 'assets/fonts');
  return Object.entries(FONT_WEIGHTS)
    .map(([w, weight]) => {
      const b64 = readFileSync(join(dir, `Pretendard-${w}.otf`)).toString('base64');
      return `@font-face{font-family:'Pretendard';font-weight:${weight};src:url(data:font/otf;base64,${b64}) format('opentype');}`;
    })
    .join('\n');
}

const PALETTES = {
  ink: { bg: '#0e1726', fg: '#f4f1ea', muted: '#9aa6bd', accent: '#ff8a3d', rule: 'rgba(244,241,234,.18)' },
  paper: { bg: '#f3efe6', fg: '#1a1a1a', muted: '#6b6357', accent: '#c8531b', rule: 'rgba(26,26,26,.14)' },
  forest: { bg: '#10231c', fg: '#f1efe6', muted: '#9bb3a6', accent: '#e8b44a', rule: 'rgba(241,239,230,.16)' },
};

/** 헤드라인의 *강조어* → <em>, 줄바꿈은 <br> 유지 (그 외 태그/특수문자는 이스케이프) */
function headlineHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function cardHTML(item, no, faces) {
  const p = PALETTES[item.palette] ?? PALETTES.ink;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body{width:1080px;height:1350px}
.card{width:1080px;height:1350px;background:${p.bg};color:${p.fg};font-family:'Pretendard';
  padding:96px 92px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center}
.kicker{font-weight:600;font-size:30px;letter-spacing:.22em;color:${p.accent};text-transform:uppercase}
.no{font-weight:600;font-size:28px;color:${p.muted};letter-spacing:.1em}
.rule{height:2px;background:${p.rule};margin:40px 0}
.headline{font-weight:800;font-size:104px;line-height:1.16;letter-spacing:-.03em;margin-top:auto}
.headline em{font-style:normal;color:${p.accent};position:relative;white-space:nowrap}
.headline em::after{content:'';position:absolute;left:0;right:0;bottom:6px;height:14px;background:${p.accent};opacity:.18;z-index:-1}
.sub{font-weight:500;font-size:38px;line-height:1.5;color:${p.muted};margin-top:44px;max-width:86%}
.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:60px}
.brand{font-weight:700;font-size:34px;letter-spacing:.02em}
.tag{font-weight:500;font-size:26px;color:${p.muted}}
.bigmark{position:absolute;top:300px;right:-30px;font-weight:800;font-size:560px;color:${p.fg};opacity:.04;line-height:.8}
</style></head><body>
<div class="card">
  <div class="bigmark">"</div>
  <div class="top"><div class="kicker">${esc(item.kicker)}</div><div class="no">ISSUE ${no}</div></div>
  <div class="rule"></div>
  <div class="headline">${headlineHTML(item.headline)}</div>
  <div class="sub">${esc(item.sub)}</div>
  <div class="foot"><div class="brand">@_pslab</div><div class="tag">${esc(item.dayLabel)}</div></div>
</div></body></html>`;
}

const planFile = join(ROOT, 'data/clients', clientId, 'plan.json');
if (!existsSync(planFile)) {
  console.error(`plan.json 없음: ${planFile}`);
  process.exit(0);
}
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const items = (plan.items ?? []).filter((it) => it.headline);
if (items.length === 0) {
  console.log('렌더할 카드 항목(headline) 없음 — 건너뜀');
  process.exit(0);
}

const chromium = findChromium();
const outDir = join(ROOT, 'docs/cards', clientId);
mkdirSync(outDir, { recursive: true });
const faces = fontFaces();
const tmpHtml = join(outDir, '_tmp.html');

if (!chromium) {
  console.warn('Chromium을 찾지 못해 렌더를 건너뜁니다(기존 카드 유지). PSLAB_CHROMIUM 설정 가능.');
  // cardImage 경로만 채워 둔다 (이미 렌더된 파일이 있으면 대시보드에 보임)
  for (let i = 0; i < items.length; i++) {
    const file = `${items[i].id}.png`;
    if (existsSync(join(outDir, file))) items[i].cardImage = `cards/${clientId}/${file}`;
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
  process.exit(0);
}

let n = 0;
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const no = String(i + 1).padStart(2, '0');
  writeFileSync(tmpHtml, cardHTML(item, no, faces));
  const file = `${item.id}.png`;
  execFileSync(
    chromium,
    [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1080,1350',
      '--default-background-color=00000000',
      `--screenshot=${join(outDir, file)}`,
      `file://${tmpHtml}`,
    ],
    { stdio: 'pipe' },
  );
  item.cardImage = `cards/${clientId}/${file}`;
  n++;
}
// 임시 파일 정리
try {
  for (const f of readdirSync(outDir)) if (f === '_tmp.html') execFileSync('rm', [join(outDir, f)]);
} catch {
  /* ignore */
}
writeFileSync(planFile, JSON.stringify(plan, null, 2));
console.log(`카드 ${n}장 렌더 완료 → docs/cards/${clientId}/`);
