#!/usr/bin/env node
/**
 * 유튜브 쇼츠 슬라이드 렌더러 (세로 9:16, 1080x1920)
 *
 * youtube 항목의 대본(captionBody: [HOOK]/[본론]/[CTA])을 파싱해
 * 큰 자막 슬라이드(PNG)로 렌더한다. docs/shorts/<id>/slide-N.png
 * → build-shorts-video.mjs 가 ffmpeg로 mp4로 합성한다.
 *
 * 한글 깨짐 없는 HTML→Chromium 렌더. 쇼츠 UI(하단 좌우)를 피하는 세이프존 적용.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'pslab');

function findChromium() {
  if (process.env.PSLAB_CHROMIUM && existsSync(process.env.PSLAB_CHROMIUM)) return process.env.PSLAB_CHROMIUM;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', 'chrome']) {
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim(); } catch { /* keep */ }
  }
  return null;
}
const FONT_WEIGHTS = { ExtraBold: 800, Bold: 700, SemiBold: 600, Medium: 500, Regular: 400 };
function fontFaces() {
  const dir = join(ROOT, 'assets/fonts');
  return Object.entries(FONT_WEIGHTS).map(([w, weight]) => {
    const b64 = readFileSync(join(dir, `Pretendard-${w}.otf`)).toString('base64');
    return `@font-face{font-family:'Pretendard';font-weight:${weight};src:url(data:font/otf;base64,${b64}) format('opentype');}`;
  }).join('\n');
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 대본 → 슬라이드 배열로 파싱 */
export function parseScript(item) {
  const title = (item.headline ?? item.topic ?? '').replace(/<br>/g, ' ').replace(/\*/g, '');
  const body = String(item.captionBody ?? '');
  const slides = [];
  // 섹션 분리: [HOOK ...], [본론 ...], [CTA ...]
  const blocks = body.split(/\n(?=\[)/);
  let hook = '', main = [], cta = '';
  for (const b of blocks) {
    const head = (b.match(/^\[([^\]]*)\]/) || [])[1] || '';
    const text = b.replace(/^\[[^\]]*\]\s*/, '').trim();
    if (/HOOK|후킹|훅/i.test(head)) hook = text;
    else if (/CTA|마무리|행동/i.test(head)) cta = text;
    else if (/본론|BODY|내용/i.test(head)) main = text.split('\n').map((x) => x.trim()).filter(Boolean);
    else if (text) main.push(...text.split('\n').map((x) => x.trim()).filter(Boolean));
  }
  // 1) 훅
  slides.push({ kind: 'hook', kicker: 'pslab shorts', big: hook || title, title });
  // 2) 본론 (불릿/문장별로, 최대 6장)
  let n = 0;
  for (const line of main.slice(0, 6)) {
    const bullet = /^[-•]/.test(line);
    n++;
    slides.push({ kind: 'point', no: n, bullet, text: line.replace(/^[-•]\s*/, '') });
  }
  // 3) CTA
  slides.push({ kind: 'cta', big: cta || '저장해두세요.', title });
  return slides;
}

function slideHtml(s) {
  const T = { bg: '#0e1726', fg: '#f4f1ea', muted: '#9aa6bd', accent: '#ff8a3d', accent2: '#36d6c4' };
  let inner = '';
  if (s.kind === 'hook') {
    inner = `<div class="kicker">${esc(s.kicker)}</div><div class="hook">${esc(s.big)}</div>`;
  } else if (s.kind === 'point') {
    inner = `<div class="pno">${s.no}</div><div class="ptext">${esc(s.text)}</div>`;
  } else {
    inner = `<div class="ctab">${esc(s.big)}</div><div class="ctasub">${esc(s.title)}</div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body{width:1080px;height:1920px}
body{font-family:'Pretendard';background:${T.bg};color:${T.fg};display:flex;align-items:center;justify-content:center}
/* 세이프존: 상단 320 / 하단 480(쇼츠 UI·캡션) 피해 중앙 밴드에 배치 */
.wrap{width:1080px;height:1920px;padding:340px 96px 500px;display:flex;flex-direction:column;justify-content:center;text-align:center}
.kicker{font-weight:700;font-size:40px;letter-spacing:.22em;color:${T.accent};text-transform:uppercase;margin-bottom:40px}
.hook{font-weight:800;font-size:104px;line-height:1.22;letter-spacing:-.03em;word-break:keep-all;text-wrap:pretty}
.pno{font-weight:800;font-size:88px;color:${T.accent};margin-bottom:34px}
.ptext{font-weight:700;font-size:82px;line-height:1.35;letter-spacing:-.02em;word-break:keep-all;text-wrap:pretty}
.ctab{font-weight:800;font-size:110px;line-height:1.2;color:${T.accent2};word-break:keep-all}
.ctasub{font-weight:600;font-size:46px;color:${T.muted};margin-top:40px;word-break:keep-all}
.brand{position:absolute;left:0;right:0;bottom:360px;text-align:center;font-weight:700;font-size:38px;color:${T.muted}}
</style></head><body><div class="wrap">${inner}</div><div class="brand">@_pslab</div></body></html>`;
}

const chromium = findChromium();
const FILE = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(FILE, 'utf8'));
const items = plan.items.filter((i) => i.channels[0] === 'youtube');
if (!chromium) { console.log('Chromium 없음 → 쇼츠 슬라이드 렌더 건너뜀'); process.exit(0); }

let total = 0;
for (const it of items) {
  const slides = parseScript(it);
  const outDir = join(ROOT, 'docs/shorts', it.id);
  mkdirSync(outDir, { recursive: true });
  const tmp = join(outDir, '_tmp.html');
  slides.forEach((s, i) => {
    writeFileSync(tmp, slideHtml(s));
    execFileSync(chromium, [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1080,1920',
      `--screenshot=${join(outDir, `slide-${i + 1}.png`)}`, `file://${tmp}`,
    ], { stdio: 'pipe' });
    total++;
  });
  try { rmSync(tmp); } catch { /* ignore */ }
  // 슬라이드 수를 기록(영상 빌더가 사용)
  writeFileSync(join(outDir, 'slides.json'), JSON.stringify({ count: slides.length }));
  console.log(`  ${it.id}: ${slides.length}장`);
}
console.log(`쇼츠 슬라이드 ${total}장 렌더 완료 → docs/shorts/`);
