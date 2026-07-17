#!/usr/bin/env node
/**
 * 매거진 카드 렌더러 (pslab 솔루션의 이미지 엔진)
 *
 * data/clients/<id>/plan.json 의 각 항목을 매거진 스타일 카드(PNG)로 렌더해
 * docs/cards/<id>/<itemId>.png 에 저장하고, plan.json 에 cardImage 경로를 채운다.
 *
 * - 타이포는 HTML/CSS로 렌더(헤드리스 Chromium) → 한글 100% 선명, 인물 미사용.
 * - 주제 그래픽: item.motif(chart/lock/compass/branch/rocket/bulb/growth)를 SVG로 합성.
 * - 디자인 변형: item.variant(A/B/C)로 색·레이아웃을 바꿔 반응도 A/B 테스트.
 *
 * 사용: node scripts/render-cards.mjs --client pslab
 * Chromium 경로: PSLAB_CHROMIUM > /opt/pw-browsers/chromium > which chromium
 * Chromium이 없으면 렌더를 건너뛴다(기존 커밋된 카드 유지) — CI를 깨지 않음.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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

// 디자인 변형 — 모두 잉크(다크) 계열, 액센트·레이아웃을 바꿔 A/B 테스트
const VARIANTS = {
  A: { name: '잉크·에디토리얼', bg: '#0e1726', fg: '#f4f1ea', muted: '#9aa6bd', accent: '#ff8a3d', layout: 'editorial' },
  B: { name: '잉크·그래픽', bg: '#0b1a1c', fg: '#eef3f1', muted: '#8fb0ab', accent: '#36d6c4', layout: 'graphic' },
  C: { name: '잉크·스포트라이트', bg: '#14121d', fg: '#f3eff6', muted: '#a99fc0', accent: '#ffc24a', layout: 'spotlight' },
};

// 주제 그래픽 모티프 (라인아트 SVG, viewBox 0 0 100 100)
function motifSVG(key, color, size, opacity) {
  const sw = 4.2;
  const common = `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
  const paths = {
    chart:
      `<rect x="16" y="58" width="15" height="26" ${common}/>` +
      `<rect x="42" y="42" width="15" height="42" ${common}/>` +
      `<rect x="68" y="26" width="15" height="58" ${common}/>` +
      `<polyline points="16,40 38,30 60,34 86,14" ${common}/>` +
      `<polyline points="86,14 86,26 74,18" ${common}/>`,
    lock:
      `<rect x="26" y="46" width="48" height="40" rx="7" ${common}/>` +
      `<path d="M37 46 V36 a13 13 0 0 1 26 0 V46" ${common}/>` +
      `<circle cx="50" cy="63" r="4.5" ${common}/><line x1="50" y1="67" x2="50" y2="75" ${common}/>`,
    compass:
      `<circle cx="50" cy="50" r="37" ${common}/>` +
      `<polygon points="50,20 59,50 50,80 41,50" ${common}/>` +
      `<circle cx="50" cy="50" r="3.5" fill="${color}" stroke="none"/>`,
    branch:
      `<circle cx="50" cy="22" r="5" ${common}/><line x1="50" y1="27" x2="50" y2="46" ${common}/>` +
      `<path d="M50 46 C50 66 30 64 27 82" ${common}/><path d="M50 46 C50 66 70 64 73 82" ${common}/>` +
      `<polyline points="27,82 21,74 33,76" ${common}/><polyline points="73,82 67,76 79,74" ${common}/>`,
    rocket:
      `<path d="M50 14 C62 26 62 54 56 68 L44 68 C38 54 38 26 50 14 Z" ${common}/>` +
      `<circle cx="50" cy="38" r="6.5" ${common}/>` +
      `<path d="M44 64 L33 78 L42 72" ${common}/><path d="M56 64 L67 78 L58 72" ${common}/>` +
      `<path d="M46 70 Q50 84 54 70" ${common}/>`,
    bulb:
      `<circle cx="50" cy="40" r="23" ${common}/>` +
      `<line x1="41" y1="66" x2="59" y2="66" ${common}/><line x1="43" y1="73" x2="57" y2="73" ${common}/><line x1="45" y1="80" x2="55" y2="80" ${common}/>` +
      `<polyline points="43,40 50,49 57,40" ${common}/>`,
    growth:
      `<line x1="16" y1="84" x2="88" y2="84" ${common}/><line x1="16" y1="84" x2="16" y2="16" ${common}/>` +
      `<path d="M20 78 Q44 76 58 50 T88 18" ${common}/>` +
      `<polyline points="88,18 76,18 84,28" ${common}/>`,
  };
  const inner = paths[key] || paths.compass;
  return `<svg class="motif" viewBox="0 0 100 100" width="${size}" height="${size}" style="opacity:${opacity}">${inner}</svg>`;
}

function headlineHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/&lt;br\s*\/?&gt;/g, '<br>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 카드 배경 — docs/bg/<id>.jpg 가 있으면 인물·상황·배경 사진을 카드 배경으로 깔고
// 어두운 그라데이션(텍스트 가독성)을 위에 얹는다. 없으면 단색(fallback).
// 레이어가 아니라 .card 배경 자체로 넣어 z-index 문제 없이 모든 텍스트가 위에 온다.
function cardBg(itemId, v, strong) {
  const f = join(ROOT, 'docs/bg', `${itemId}.jpg`);
  if (!existsSync(f)) return v.bg;
  try {
    const b64 = readFileSync(f).toString('base64');
    const g = strong
      ? 'rgba(8,12,20,.78) 0%,rgba(8,12,20,.70) 40%,rgba(8,12,20,.92) 100%'
      : 'rgba(8,12,20,.64) 0%,rgba(8,12,20,.50) 38%,rgba(8,12,20,.90) 100%';
    return `${v.bg};background-image:linear-gradient(180deg,${g}),url(data:image/jpeg;base64,${b64});background-size:cover;background-position:center`;
  } catch { return v.bg; }
}

// #rrggbb → rgba(r,g,b,a)
function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
// 내용 슬라이드 배경 — 사진을 반복하지 않고, 슬라이드마다 미묘하게 변하는 단색.
// 액센트를 아주 옅게 깐 라디얼 그라데이션 위치를 슬라이드 번호로 회전시킨다.
function slideBg(v, n) {
  const pos = ['118% -12%', '-18% 112%', '112% 118%', '-12% -12%', '50% -22%', '120% 55%'];
  const p = pos[(Math.max(1, n) - 1) % pos.length];
  return `${v.bg};background-image:radial-gradient(70% 55% at ${p}, ${hexA(v.accent, 0.13)} 0%, transparent 62%)`;
}

function cardHTML(item, no, faces) {
  const v = VARIANTS[item.variant] || VARIANTS.A;
  const rule = `rgba(255,255,255,.16)`;
  let body;
  if (v.layout === 'graphic') {
    // B: 좌측 텍스트 + 우측 큰 주제 그래픽(액센트, 선명)
    body = `
    <div class="abar"></div>
    <div class="top"><div class="kicker">${esc(item.kicker)}</div><div class="no">ISSUE ${no}</div></div>
    <div class="rule"></div>
    <div class="gwrap">
      <div class="gtext"><div class="headline">${headlineHTML(item.headline)}</div><div class="sub">${esc(item.sub)}</div></div>
      <div class="gfig">${motifSVG(item.motif, v.accent, 380, 0.96)}</div>
    </div>
    <div class="foot"><div class="brand">@_pslab</div><div class="tag">${esc(item.dayLabel)}</div></div>`;
  } else if (v.layout === 'spotlight') {
    // C: 거대 호수 + 중앙 정렬 헤드라인 + 상단 작은 그래픽
    body = `
    <div class="bigno">${no}</div>
    <div class="top"><div class="kicker">${esc(item.kicker)}</div><div class="smfig">${motifSVG(item.motif, v.accent, 96, 0.95)}</div></div>
    <div class="center">
      <div class="headline" style="text-align:center">${headlineHTML(item.headline)}</div>
      <div class="sub" style="text-align:center;margin-left:auto;margin-right:auto">${esc(item.sub)}</div>
    </div>
    <div class="foot"><div class="brand">@_pslab</div><div class="tag">${esc(item.dayLabel)}</div></div>`;
  } else {
    // A: 에디토리얼 — 큰 그래픽 배경 워터마크 + 좌하단 헤드라인
    body = `
    <div class="bgfig">${motifSVG(item.motif, v.fg, 560, 0.07)}</div>
    <div class="top"><div class="kicker">${esc(item.kicker)}</div><div class="no">ISSUE ${no}</div></div>
    <div class="rule"></div>
    <div class="headline" style="margin-top:auto">${headlineHTML(item.headline)}</div>
    <div class="sub">${esc(item.sub)}</div>
    <div class="foot"><div class="brand">@_pslab</div><div class="tag">${esc(item.dayLabel)}</div></div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;
  word-break:keep-all;overflow-wrap:break-word;text-wrap:pretty}
html,body{width:1080px;height:1350px}
/* 세이프존: 모든 텍스트는 이 여백 안에 둔다. 인스타 프로필 그리드는 4:5를
   1:1 중앙으로 크롭(상하 135px 잘림)하므로 핵심 텍스트는 중앙 밴드에 배치. */
:root{--safe-x:96px;--safe-t:120px;--safe-b:130px}
.card{width:1080px;height:1350px;background:${cardBg(item.id, v)};color:${v.fg};font-family:'Pretendard';
  padding:var(--safe-t) var(--safe-x) var(--safe-b);display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;z-index:2}
.kicker{font-weight:600;font-size:30px;letter-spacing:.22em;color:${v.accent};text-transform:uppercase}
.no{font-weight:600;font-size:28px;color:${v.muted};letter-spacing:.1em}
.rule{height:2px;background:${rule};margin:40px 0;z-index:2}
.headline{font-weight:800;font-size:104px;line-height:1.16;letter-spacing:-.03em;z-index:2;position:relative}
.headline em{font-style:normal;color:${v.accent};position:relative;white-space:nowrap}
.headline em::after{content:'';position:absolute;left:0;right:0;bottom:6px;height:14px;background:${v.accent};opacity:.18;z-index:-1}
.sub{font-weight:500;font-size:38px;line-height:1.5;color:${v.muted};margin-top:44px;max-width:86%;z-index:2}
.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:60px;z-index:2}
.brand{font-weight:700;font-size:34px;letter-spacing:.02em}
.tag{font-weight:500;font-size:26px;color:${v.muted}}
.bgfig{position:absolute;top:300px;right:-40px;z-index:1}
.abar{position:absolute;left:0;top:0;bottom:0;width:16px;background:${v.accent}}
.gwrap{display:flex;align-items:center;gap:30px;margin-top:auto;z-index:2}
.gtext{flex:1}.gtext .headline{font-size:90px}.gtext .sub{max-width:100%}
.gfig{flex:0 0 auto;display:flex;align-items:center;justify-content:center}
.smfig{display:flex;align-items:center}
.bigno{position:absolute;top:120px;left:70px;font-weight:800;font-size:300px;line-height:.8;color:${v.accent};opacity:.12;z-index:1}
.center{margin:auto 0;z-index:2}
</style></head><body><div class="card">${body}</div></body></html>`;
}

const bodyHTML = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

// 캐러셀 내용 슬라이드 (커버 다음 장들) — 큰 라벨 + 제목 + 본문, 변형 팔레트 사용
function contentSlideHTML(item, slide, n, total, faces) {
  const v = VARIANTS[item.variant] || VARIANTS.A;
  const rule = 'rgba(255,255,255,.16)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;
  word-break:keep-all;overflow-wrap:break-word;text-wrap:pretty}
html,body{width:1080px;height:1350px}
/* 세이프존: 모든 텍스트는 이 여백 안에 둔다. 인스타 프로필 그리드는 4:5를
   1:1 중앙으로 크롭(상하 135px 잘림)하므로 핵심 텍스트는 중앙 밴드에 배치. */
:root{--safe-x:96px;--safe-t:120px;--safe-b:130px}
.card{width:1080px;height:1350px;background:${slideBg(v, n)};color:${v.fg};font-family:'Pretendard';
  padding:var(--safe-t) var(--safe-x) var(--safe-b);display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center}
.kicker{font-weight:600;font-size:27px;letter-spacing:.2em;color:${v.muted};text-transform:uppercase}
.page{font-weight:700;font-size:26px;color:${v.accent};letter-spacing:.08em}
.rule{height:2px;background:${rule};margin:36px 0 0}
.label{font-weight:800;font-size:120px;line-height:1;color:${v.accent};margin-top:70px;letter-spacing:-.02em}
.title{font-weight:800;font-size:78px;line-height:1.2;letter-spacing:-.02em;margin-top:24px}
.body{font-weight:500;font-size:42px;line-height:1.62;color:${v.fg};opacity:.9;margin-top:36px;max-width:96%}
.foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:50px}
.brand{font-weight:700;font-size:32px;letter-spacing:.02em}
.tag{font-weight:500;font-size:25px;color:${v.muted}}
.bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:${v.accent};opacity:.85}
</style></head><body><div class="card">
  <div class="bar"></div>
  <div class="top"><div class="kicker">${esc(item.kicker)}</div><div class="page">${n} / ${total}</div></div>
  <div class="rule"></div>
  ${slide.label ? `<div class="label">${esc(slide.label)}</div>` : ''}
  ${slide.title ? `<div class="title">${esc(slide.title)}</div>` : ''}
  ${slide.body ? `<div class="body">${bodyHTML(slide.body)}</div>` : ''}
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

const outDir = join(ROOT, 'docs/cards', clientId);
mkdirSync(outDir, { recursive: true });
const chromium = findChromium();

// 한 항목의 전체 슬라이드(커버 + 내용) 파일명 목록
function slideFilesFor(item) {
  const total = 1 + (item.slides?.length ?? 0);
  return Array.from({ length: total }, (_, k) => `${item.id}-${k + 1}.png`);
}

if (!chromium) {
  console.warn('Chromium을 찾지 못해 렌더를 건너뜁니다(기존 카드 유지). PSLAB_CHROMIUM 설정 가능.');
  for (const it of items) {
    const files = slideFilesFor(it).filter((f) => existsSync(join(outDir, f)));
    if (files.length) {
      it.slideImages = files.map((f) => `cards/${clientId}/${f}`);
      it.cardImage = it.slideImages[0];
    }
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
  process.exit(0);
}

const faces = fontFaces();
const tmpHtml = join(outDir, '_tmp.html');
function shoot(html, file) {
  writeFileSync(tmpHtml, html);
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
}

let nSlides = 0;
for (let i = 0; i < items.length; i++) {
  const item = items[i];
  const no = String(i + 1).padStart(2, '0');
  const slides = item.slides ?? [];
  const total = 1 + slides.length;
  const files = [];
  // 슬라이드 1 = 커버
  shoot(cardHTML(item, no, faces), `${item.id}-1.png`);
  files.push(`cards/${clientId}/${item.id}-1.png`);
  nSlides++;
  // 슬라이드 2..N = 내용
  slides.forEach((slide, k) => {
    const f = `${item.id}-${k + 2}.png`;
    shoot(contentSlideHTML(item, slide, k + 2, total, faces), f);
    files.push(`cards/${clientId}/${f}`);
    nSlides++;
  });
  item.slideImages = files;
  item.cardImage = files[0];
}
try { rmSync(tmpHtml); } catch { /* ignore */ }
writeFileSync(planFile, JSON.stringify(plan, null, 2));
console.log(`${items.length}개 콘텐츠 · 슬라이드 ${nSlides}장 렌더 완료 → docs/cards/${clientId}/`);
