#!/usr/bin/env node
/**
 * 비츠(VITTZ) 전용 카드 렌더러 — "전구빛" 디자인 시스템
 *
 * 사전 조사(research/05·08)에서 정의한 브랜드 감도를 그대로 구현한다:
 *  - "저녁 시간대 전구빛이 켜진 실제 집" — 빛이 주인공. 사진 없이 CSS/SVG로 빛을 그린다.
 *  - 무드 2종: dusk(저녁 전구빛 공간 — 감성/시의성) · paper(웜 페이퍼 — 제품/정보)
 *  - 한글 시리즈 라벨 + 상단 VITTZ 로고타입 + 하단 @핸들 + 캐러셀 진행 도트
 *  - 팔레트: 웜화이트 #FAF6EF / 딥차콜 #26221D / 앰버 #E8A13D / 전구빛 글로우
 *
 * 슬라이드 스키마(plan.json items[].slides[]):
 *   { scene: 'cover|pendant|fan|window|bulbs|split|spec|cta', label, title, body, big? }
 * 아이템: { mood: 'dusk'|'paper', series: '비츠 · 여름 시선' 같은 한글 라벨 }
 *
 * 사용: node scripts/render-vittz-cards.mjs --client vittz
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'vittz');

function findChromium() {
  if (process.env.PSLAB_CHROMIUM && existsSync(process.env.PSLAB_CHROMIUM)) return process.env.PSLAB_CHROMIUM;
  if (existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  for (const c of ['chromium', 'chromium-browser', 'google-chrome', 'chrome']) {
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim(); } catch { /* next */ }
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

// ── 무드 팔레트 (research/05 감도 정의) ──────────────────────────────
const MOODS = {
  // 저녁, 전구가 켜진 방 — 깊은 웜 브라운 위 앰버 빛 웅덩이
  dusk: {
    bg: '#191209', ink: '#F7F0E1', muted: '#C9B896', accent: '#E8A13D',
    glow: '240,180,92', line: 'rgba(232,161,61,.28)', chip: 'rgba(232,161,61,.14)',
  },
  // 웜 페이퍼 — 밝은 정보 무드, 차콜 잉크 + 앰버 포인트
  paper: {
    bg: '#FAF6EF', ink: '#2A241B', muted: '#93826A', accent: '#B26E0F',
    glow: '232,161,61', line: 'rgba(178,110,15,.25)', chip: 'rgba(232,161,61,.16)',
  },
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const br = (s) => esc(s).replace(/\n/g, '<br>');
// *강조* → 전구빛 하이라이트
const hl = (s) => br(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

// ── 빛 드로잉 (SVG) — 사진 없이 조명과 빛을 그린다 ──────────────────
function svgPendant(m, big) {
  const w = big ? 560 : 420, glow = m.glow;
  return `<svg viewBox="0 0 200 260" width="${w}" style="display:block">
    <defs>
      <radialGradient id="bulbG" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(${glow},.95)"/><stop offset="45%" stop-color="rgba(${glow},.55)"/><stop offset="100%" stop-color="rgba(${glow},0)"/>
      </radialGradient>
      <linearGradient id="coneG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(${glow},.34)"/><stop offset="100%" stop-color="rgba(${glow},0)"/>
      </linearGradient>
    </defs>
    <line x1="100" y1="0" x2="100" y2="58" stroke="${m.muted}" stroke-width="2.4"/>
    <path d="M64 96 A36 36 0 0 1 136 96 L128 104 L72 104 Z" fill="${m.bg === '#191209' ? '#2E2416' : '#3A2F1F'}" stroke="${m.muted}" stroke-width="2.4"/>
    <circle cx="100" cy="120" r="52" fill="url(#bulbG)"/>
    <circle cx="100" cy="114" r="11" fill="rgba(${glow},.98)"/>
    <polygon points="58,116 142,116 178,252 22,252" fill="url(#coneG)"/>
  </svg>`;
}
function svgFan(m) {
  const g = m.glow;
  return `<svg viewBox="0 0 260 200" width="620" style="display:block">
    <defs><radialGradient id="fanG" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(${g},.9)"/><stop offset="55%" stop-color="rgba(${g},.35)"/><stop offset="100%" stop-color="rgba(${g},0)"/>
    </radialGradient></defs>
    <line x1="130" y1="0" x2="130" y2="34" stroke="${m.muted}" stroke-width="3"/>
    <g stroke="${m.muted}" stroke-width="3" fill="${m.bg === '#191209' ? '#2E2416' : '#EADFC9'}">
      <ellipse cx="52" cy="62" rx="52" ry="13" transform="rotate(-16 52 62)"/>
      <ellipse cx="208" cy="62" rx="52" ry="13" transform="rotate(16 208 62)"/>
      <ellipse cx="88" cy="86" rx="50" ry="12" transform="rotate(24 88 86)"/>
      <ellipse cx="172" cy="86" rx="50" ry="12" transform="rotate(-24 172 86)"/>
    </g>
    <circle cx="130" cy="66" r="20" fill="${m.bg === '#191209' ? '#3A2C17' : '#E3D5B8'}" stroke="${m.muted}" stroke-width="3"/>
    <circle cx="130" cy="96" r="46" fill="url(#fanG)"/>
    <circle cx="130" cy="84" r="12" fill="rgba(${g},.95)"/>
    <path d="M28 30 Q40 22 52 30" stroke="rgba(${g},.5)" stroke-width="3" fill="none"/>
    <path d="M208 30 Q220 22 232 30" stroke="rgba(${g},.5)" stroke-width="3" fill="none"/>
  </svg>`;
}
function svgBulbs(m) {
  const g = m.glow;
  const bulb = (cx, color, r) =>
    `<circle cx="${cx}" cy="70" r="34" fill="${color}" opacity="${r}"/>` +
    `<circle cx="${cx}" cy="70" r="15" fill="${color}"/>` +
    `<line x1="${cx}" y1="0" x2="${cx}" y2="34" stroke="${m.muted}" stroke-width="2.4"/>`;
  return `<svg viewBox="0 0 320 130" width="640" style="display:block">
    ${bulb(60, 'rgba(214,226,255,.85)', 0.22)}
    ${bulb(160, 'rgba(255,244,214,.9)', 0.26)}
    ${bulb(260, `rgba(${g},.95)`, 0.34)}
  </svg>`;
}

// ── 공통 프레임 ─────────────────────────────────────────────────────
function frame(m, seriesLabel, inner, pageNo, pageTotal, handle) {
  const dots = Array.from({ length: pageTotal }, (_, i) =>
    `<span class="dot${i + 1 === pageNo ? ' on' : ''}"></span>`).join('');
  return `<div class="card">
    <div class="top"><div class="logo">VITTZ</div><div class="series">${esc(seriesLabel)}</div></div>
    ${inner}
    <div class="foot"><div class="handle">${esc(handle)}</div><div class="dots">${dots}</div></div>
  </div>`;
}

function sceneHTML(item, s, m, idx) {
  const art = { pendant: svgPendant(m), fan: svgFan(m), bulbs: svgBulbs(m) }[s.scene] || '';
  if (s.scene === 'cover' || idx === 0) {
    // 커버 — 큰 빛 + 질문 헤드라인 + 인터랙션 칩
    const coverArt = { fan: svgFan(m), pendant: svgPendant(m, true), bulbs: svgBulbs(m) }[s.art || 'pendant'] || svgPendant(m, true);
    return `<div class="mid cover">
      <div class="art">${coverArt}</div>
      <div class="headline">${hl(s.title)}</div>
      ${s.body ? `<div class="chip">${br(s.body)}</div>` : ''}
    </div>`;
  }
  if (s.scene === 'split') {
    return `<div class="mid">
      <div class="split">
        <div class="half before"><div class="halfLab">${esc(s.beforeLabel || '지금')}</div><div class="halfTxt">${br(s.before || '')}</div></div>
        <div class="half after"><div class="halfLab">${esc(s.afterLabel || '바꾼 뒤')}</div><div class="halfTxt">${br(s.after || '')}</div></div>
      </div>
      <div class="title" style="margin-top:64px">${hl(s.title)}</div>
      <div class="body">${br(s.body)}</div>
    </div>`;
  }
  if (s.scene === 'spec') {
    return `<div class="mid">
      <div class="klabel">${esc(s.label || '')}</div>
      <div class="big">${hl(s.big || '')}</div>
      <div class="title">${hl(s.title)}</div>
      <div class="body">${br(s.body)}</div>
      ${art ? `<div class="artS">${art}</div>` : ''}
    </div>`;
  }
  if (s.scene === 'cta') {
    return `<div class="mid cta">
      <div class="artS">${svgPendant(m)}</div>
      <div class="title" style="text-align:center">${hl(s.title)}</div>
      <div class="body" style="text-align:center;margin-left:auto;margin-right:auto">${br(s.body)}</div>
      <div class="ctaline">비츠 딜리버리 · 배달과 설치를 한 번에</div>
    </div>`;
  }
  // point (기본): 한글 라벨 + 제목 + 본문 + 보조 아트
  return `<div class="mid">
    <div class="klabel">${esc(s.label || '')}</div>
    <div class="title">${hl(s.title)}</div>
    <div class="body">${br(s.body)}</div>
    ${art ? `<div class="artS">${art}</div>` : ''}
  </div>`;
}

function pageHTML(item, s, m, idx, total, handle, faces) {
  // 배경 — dusk: 방 안 저녁 빛(코너 글로우 + 바닥 빛 웅덩이) / paper: 종이 위 옅은 앰버 김
  const bg = m === MOODS.dusk
    ? `background:${m.bg};background-image:` +
      `radial-gradient(60% 42% at 78% 6%, rgba(${m.glow},.20) 0%, transparent 60%),` +
      `radial-gradient(75% 30% at 50% 108%, rgba(${m.glow},.14) 0%, transparent 65%)`
    : `background:${m.bg};background-image:` +
      `radial-gradient(55% 38% at 88% -6%, rgba(${m.glow},.18) 0%, transparent 62%),` +
      `radial-gradient(50% 30% at -8% 106%, rgba(${m.glow},.12) 0%, transparent 60%)`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px}
body{font-family:'Pretendard';color:${m.ink}}
.card{width:1080px;height:1350px;${bg};padding:88px 92px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:baseline}
.logo{font-weight:800;font-size:34px;letter-spacing:.34em;color:${m.accent}}
.series{font-weight:600;font-size:27px;letter-spacing:.18em;color:${m.muted}}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center}
.cover{align-items:flex-start}
.cover .art{align-self:center;margin-bottom:8px}
.headline{font-weight:800;font-size:92px;line-height:1.22;letter-spacing:-.028em;text-wrap:balance}
.headline em{font-style:normal;color:${m.accent};position:relative}
.headline em::after{content:'';position:absolute;left:-2%;right:-2%;bottom:4px;height:20px;background:rgba(${m.glow},.22);z-index:-1;border-radius:6px}
.chip{margin-top:52px;display:inline-block;background:${m.chip};border:1.5px solid ${m.line};border-radius:999px;padding:22px 38px;font-size:35px;font-weight:600;color:${m.ink};line-height:1.45}
.klabel{font-weight:700;font-size:30px;letter-spacing:.22em;color:${m.accent};margin-bottom:34px}
.title{font-weight:800;font-size:76px;line-height:1.26;letter-spacing:-.024em;text-wrap:balance}
.title em{font-style:normal;color:${m.accent}}
.body{font-weight:500;font-size:40px;line-height:1.66;color:${m.muted};margin-top:40px;max-width:96%}
.big{font-weight:800;font-size:150px;letter-spacing:-.03em;color:${m.accent};line-height:1;margin-bottom:26px}
.big em{font-style:normal;font-size:64px;letter-spacing:0;color:${m.muted};font-weight:700}
.artS{margin-top:56px;opacity:.98}
.cta{align-items:center;text-align:center}
.ctaline{margin-top:56px;border-top:1.5px solid ${m.line};padding-top:34px;font-size:32px;letter-spacing:.06em;color:${m.accent};font-weight:700;width:100%;text-align:center}
.split{display:flex;gap:0;border-radius:26px;overflow:hidden;border:1.5px solid ${m.line}}
.half{flex:1;padding:56px 44px;min-height:420px;display:flex;flex-direction:column;gap:22px}
.before{background:#12151C;color:#9AA3B5}
.after{background:linear-gradient(180deg,#2A2013 0%,#3A2B15 100%);color:#F7F0E1;position:relative}
.after::before{content:'';position:absolute;inset:0;background:radial-gradient(70% 55% at 50% 18%, rgba(${MOODS.dusk.glow},.35) 0%, transparent 65%)}
.halfLab{font-weight:700;font-size:28px;letter-spacing:.2em;opacity:.85;position:relative}
.halfTxt{font-weight:600;font-size:37px;line-height:1.55;position:relative}
.foot{display:flex;justify-content:space-between;align-items:center}
.handle{font-weight:700;font-size:30px;color:${m.muted}}
.dots{display:flex;gap:12px}
.dot{width:14px;height:14px;border-radius:50%;background:${m.line}}
.dot.on{background:${m.accent}}
</style></head><body>${frame(m, item.series || '비츠', sceneHTML(item, s, m, idx), idx + 1, total, item.handle)}</body></html>`;
}

// ── 실행 ───────────────────────────────────────────────────────────
const chromium = findChromium();
if (!chromium) { console.log('Chromium 없음 — 렌더 건너뜀'); process.exit(0); }
const planPath = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const client = JSON.parse(readFileSync(join(ROOT, 'clients', `${clientId}.json`), 'utf8'));
const handle = `@${client.accounts?.instagram || clientId}`;
const outDir = join(ROOT, 'docs/cards', clientId);
mkdirSync(outDir, { recursive: true });
const faces = fontFaces();
const tmp = join(outDir, '_tmp.html');

let n = 0;
for (const item of plan.items) {
  if (!Array.isArray(item.slides) || !item.slides.length) continue;
  const m = MOODS[item.mood] || MOODS.paper;
  item.handle = handle;
  const total = item.slides.length;
  const files = [];
  item.slides.forEach((s, idx) => {
    const file = `${item.id}-${idx + 1}.png`;
    writeFileSync(tmp, pageHTML(item, s, m, idx, total, handle, faces));
    execFileSync(chromium, [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1080,1350',
      `--screenshot=${join(outDir, file)}`, `file://${tmp}`,
    ], { stdio: 'pipe' });
    files.push(`cards/${clientId}/${file}`);
    n++;
  });
  delete item.handle;
  item.slideImages = files;
  item.cardImage = files[0];
}
try { rmSync(tmp); } catch { /* ignore */ }
writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
console.log(`비츠 전구빛 카드 ${n}장 렌더 완료 → docs/cards/${clientId}/`);
