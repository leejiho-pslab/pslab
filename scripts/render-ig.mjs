#!/usr/bin/env node
/**
 * 인스타그램 "이미지 전면형" 카드 렌더러 (레퍼런스 L 스타일)
 *
 * plan.json 의 인스타 항목 중 slidePhotos(슬라이드별 이미지 URL 배열)를 가진 항목만 렌더한다.
 *  - 슬라이드마다 서로 다른 실사/AI 이미지를 배경 전면에 깔고, 그 위에 한글 타이틀을 HTML로 얹는다
 *    (한글/영문 깨짐 방지 — AI 이미지에 글자를 굽지 않고 오버레이).
 *  - igStyle 로 3가지 디자인(cinema / photoA / photoB)을 완전히 다르게 렌더 → 콘텐츠마다 톤 차별화.
 *  - 이미지는 CI에서 URL을 받아 base64로 인라인. 실패하면 단색 폴백.
 * 결과: docs/cards/<id>/<id>-N.png, plan.json 의 slideImages/cardImage 기록.
 * 사용: node scripts/render-ig.mjs --client pslab
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outroHTML, outroRel, OUTRO_FILE } from './ig-outro.mjs';

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
  const pre = Object.entries(FONT_WEIGHTS).map(([w, weight]) => {
    const b64 = readFileSync(join(dir, `Pretendard-${w}.otf`)).toString('base64');
    return `@font-face{font-family:'Pretendard';font-weight:${weight};src:url(data:font/otf;base64,${b64}) format('opentype');}`;
  });
  // 명조(세리프) 디스플레이 — 럭셔리 에디토리얼 감. 제목 전용.
  const serif = [['Bold', 700], ['ExtraBold', 800]].map(([w, weight]) => {
    const b64 = readFileSync(join(dir, `NanumMyeongjo-${w}.woff2`)).toString('base64');
    return `@font-face{font-family:'Myeongjo';font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  });
  return [...pre, ...serif].join('\n');
}
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const hl = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

async function dl(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return '';
    const b = Buffer.from(await r.arrayBuffer());
    return b.toString('base64');
  } catch { return ''; }
}

// ── 3가지 스타일 ────────────────────────────────
// 공통: 1080x1350. 배경 사진 full-bleed + 하단 스크림. 타이틀/본문은 HTML.
// ⚠️ 헤드리스 크로미움은 하단 ~110px가 캡처에서 잘린다(윈도우 높이≠가용 높이).
//    그래서 모든 하단 텍스트는 flex-end + padding-bottom:135(세이프존) 안에 둔다.
const SAFE_B = 135;
// 통일 팔레트: Ink(딥네이비)·Ivory·Gold·Signal(레드)·Mist. 명조 디스플레이 + Pretendard 라벨/본문.
function styleCSS(faces) {
  return `${faces}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:break-word;text-wrap:pretty}
:root{--ink:#0c1526;--ivory:#f4efe6;--gold:#c9a86a;--gold-d:#b8923f;--signal:#e2503f;--mist:#9fb0c6}
html,body{width:1080px;height:1350px;font-family:'Pretendard';background:#0a1220}
.card{width:1080px;height:1350px;position:relative;overflow:hidden;background:var(--ink);color:var(--ivory)}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.stage{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 96px ${SAFE_B}px}
`;
}

// Editorial: 무드/언박싱. 전면 사진 + 딥네이비 스크림 + 명조 대형 아이보리 제목 + 골드 라벨·헤어라인.
function cinemaHTML(photoB64, title, sub, faces) {
  const bg = photoB64 ? `background-image:url(data:image/png;base64,${photoB64})` : 'background:linear-gradient(140deg,#16233c,#0a1220)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styleCSS(faces)}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,14,26,.10) 0%,rgba(8,14,26,.04) 40%,rgba(8,14,26,.64) 74%,rgba(8,14,26,.95) 100%)}
.label{font-weight:600;font-size:27px;letter-spacing:.30em;color:var(--gold);text-transform:uppercase;margin-bottom:26px;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.title{font-family:'Myeongjo';font-weight:800;font-size:90px;line-height:1.2;letter-spacing:-.01em;color:var(--ivory);text-shadow:0 4px 26px rgba(0,0,0,.7)}
.title em{color:var(--gold);font-style:normal}
.brand{margin-top:34px;padding-top:26px;border-top:1.5px solid rgba(201,168,106,.5);font-weight:700;font-size:30px;letter-spacing:.04em;color:rgba(244,239,230,.9)}
</style></head><body><div class="card"><div class="bg" style="${bg}"></div><div class="scrim"></div>
<div class="stage">${sub ? `<div class="label">${esc(sub)}</div>` : ''}<div class="title">${hl(title)}</div><div class="brand">@_pslab · 브랜드명</div></div></div></body></html>`;
}

// Catalog: 제품 단독컷. 상단 골드 헤어라인+라벨(영문 대문자 자간) + 하단 명조 제목. 절제된 스크림.
function photoAHTML(photoB64, kicker, title, body, faces) {
  const bg = photoB64 ? `background-image:url(data:image/png;base64,${photoB64})` : 'background:linear-gradient(140deg,#16233c,#0b1322)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styleCSS(faces)}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,14,26,.40) 0%,rgba(8,14,26,.05) 30%,rgba(8,14,26,.28) 60%,rgba(8,14,26,.92) 100%)}
.top{position:absolute;left:96px;right:96px;top:92px;z-index:2}
.top .ln{width:56px;height:3px;background:var(--gold);margin-bottom:22px}
.kick{font-weight:600;font-size:28px;letter-spacing:.28em;color:var(--gold);text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,.6)}
.title{font-family:'Myeongjo';font-weight:800;font-size:84px;line-height:1.22;letter-spacing:-.01em;color:var(--ivory);text-shadow:0 4px 22px rgba(0,0,0,.7)}
.title em{color:var(--gold);font-style:normal}
.body{margin-top:22px;font-weight:500;font-size:35px;line-height:1.5;color:rgba(244,239,230,.92);text-shadow:0 2px 12px rgba(0,0,0,.7)}
.brand{margin-top:30px;font-weight:700;font-size:29px;letter-spacing:.04em;color:rgba(244,239,230,.85)}
</style></head><body><div class="card"><div class="bg" style="${bg}"></div><div class="scrim"></div>
<div class="top">${kicker ? `<div class="ln"></div><div class="kick">${esc(kicker)}</div>` : ''}</div>
<div class="stage"><div class="title">${hl(title)}</div>${body ? `<div class="body">${hl(body)}</div>` : ''}<div class="brand">@_pslab</div></div></div></body></html>`;
}

// Feature: 매크로 디테일. 사진 상단 + 하단 아이보리(밝은) 밴드에 딥네이비 명조 제목. 골드 라벨.
function photoBHTML(photoB64, no, title, body, faces) {
  const bg = photoB64 ? `background-image:url(data:image/png;base64,${photoB64})` : 'background:linear-gradient(140deg,#16233c,#0b1322)';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${styleCSS(faces)}
html,body{background:var(--ivory)}
.photo{position:absolute;left:0;top:0;width:100%;height:58%;overflow:hidden}
.photo .bg{position:absolute;inset:0;${bg};background-size:cover;background-position:center}
.band{position:absolute;left:0;bottom:0;width:100%;height:44%;background:var(--ivory);color:var(--ink);padding:56px 96px ${SAFE_B}px;display:flex;flex-direction:column}
.no{align-self:flex-start;font-weight:600;font-size:26px;letter-spacing:.24em;color:var(--gold-d);text-transform:uppercase;margin-bottom:20px}
.title{font-family:'Myeongjo';font-weight:800;font-size:68px;line-height:1.24;letter-spacing:-.01em;color:var(--ink)}
.title em{color:var(--gold-d);font-style:normal}
.body{margin-top:16px;font-weight:500;font-size:33px;line-height:1.55;color:#55617a}
.brand{margin-top:auto;padding-top:20px;font-weight:700;font-size:28px;letter-spacing:.04em;color:#8a94a6}
</style></head><body><div class="card"><div class="photo"><div class="bg"></div></div>
<div class="band"><span class="no">${esc(no)}</span><div class="title">${hl(title)}</div>${body ? `<div class="body">${hl(body)}</div>` : ''}<div class="brand">@_pslab</div></div></div></body></html>`;
}

const planFile = join(ROOT, 'data/clients', clientId, 'plan.json');
if (!existsSync(planFile)) { console.log('plan.json 없음 — 건너뜀'); process.exit(0); }
const plan = JSON.parse(readFileSync(planFile, 'utf8'));
const targets = (plan.items ?? []).filter((it) => it.channels?.includes('instagram') && Array.isArray(it.slidePhotos) && it.slidePhotos.length);
if (!targets.length) { console.log('이미지 전면형 인스타 항목(slidePhotos) 없음 — 건너뜀'); process.exit(0); }

const chromium = findChromium();
if (!chromium) { console.log('Chromium 없음 — 건너뜀'); process.exit(0); }
const faces = fontFaces();
const outDir = join(ROOT, 'docs/cards', clientId);
mkdirSync(outDir, { recursive: true });

// 공통 마감 장표(강점+위치+연락처) 1회 렌더 → 모든 캐러셀 끝에 붙인다.
function shootFile(html, file) {
  const t = join(outDir, `_tmp_${file}.html`);
  writeFileSync(t, html);
  execFileSync(chromium, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1080,1350',
    `--screenshot=${join(outDir, file)}`, `file://${t}`,
  ], { stdio: 'pipe' });
  try { rmSync(t); } catch { /* ignore */ }
}
shootFile(outroHTML(faces), OUTRO_FILE);

for (const it of targets) {
  const tmp = join(outDir, `_ig_${it.id}.html`);
  const style = it.igStyle || 'photoA';
  const slides = it.slides || [];
  const files = [];
  for (let i = 0; i < it.slidePhotos.length; i++) {
    const b64 = await dl(it.slidePhotos[i]);
    const sl = slides[i];
    let html;
    if (i === 0) {
      // 커버
      html = style === 'cinema'
        ? cinemaHTML(b64, it.headline, it.sub, faces)
        : style === 'photoB'
          ? photoBHTML(b64, 'BRAND'/* 업체별 교체 */, it.headline, it.sub, faces)
          : photoAHTML(b64, it.kicker, it.headline, it.sub, faces);
    } else {
      const t = sl ? sl.title : it.topic;
      const bdy = sl ? sl.body : '';
      html = style === 'cinema'
        ? cinemaHTML(b64, t, sl ? sl.label : '', faces)
        : style === 'photoB'
          ? photoBHTML(b64, sl ? sl.label : String(i + 1), t, bdy, faces)
          : photoAHTML(b64, sl ? sl.label : '', t, bdy, faces);
    }
    writeFileSync(tmp, html);
    const file = `${it.id}-${i + 1}.png`;
    execFileSync(chromium, [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1080,1350',
      `--screenshot=${join(outDir, file)}`, `file://${tmp}`,
    ], { stdio: 'pipe' });
    files.push(`cards/${clientId}/${file}`);
  }
  try { rmSync(tmp); } catch { /* ignore */ }
  files.push(outroRel(clientId)); // 공통 마감 장표
  it.slideImages = files;
  it.cardImage = files[0];
  console.log(`  ${it.id} (${style}): ${files.length}장 (+마감장표)`);
}
writeFileSync(planFile, JSON.stringify(plan, null, 2));
console.log('이미지 전면형 인스타 렌더 완료 → docs/cards/');
