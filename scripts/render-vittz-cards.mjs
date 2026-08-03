#!/usr/bin/env node
/**
 * 비츠(VITTZ) 전용 카드 렌더러 — "실사 풀블리드 · 웜 라이트" 디자인 시스템 v2
 *
 * 레퍼런스 학습(reference-links 30건 + 드라이브 지침·릴스 12편)에서 정의한 언어를 구현한다
 * (2026-08-03 운영자 지시로 v1 '전구빛'(다크+SVG 드로잉) 시스템 전면 교체):
 *  - 공간·제품 실사가 카드 전체 배경(풀블리드 1080×1350) — 사진이 주인공
 *  - 어두운 그라데이션 스크림 위 좌측 정렬 화이트 헤드라인 + 앰버 강조
 *  - 좌상단 브랜드 워드마크 + 얇은 구분선 + 작은 영문 소라벨(장식 최소)
 *  - 제품 장: 실사 크게 + 하단 오버레이에 제품명·가격·구매 동선 집약
 *  - 색·스크림·타이포 값은 data/clients/<id>/design-tokens.json 이 단일 출처
 *
 * 슬라이드 스키마(plan.json items[].slides[]):
 *   { scene: 'cover|point|product|spec|split|cta', label, title, body, big?, en?,
 *     productKey?  — 제품 정보(이름·가격)와 실사 출처,
 *     bgKey?       — 배경 실사로 쓸 제품 키(생략 시 productKey → 첫 제품 순) }
 *   실사가 없으면(개발 환경) 웜 페이퍼 그라데이션 폴백 — CI에서 자동으로 실사가 채워진다.
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

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── 디자인 토큰 (단일 출처: design-tokens.json → card) ───────────────
const TOKEN_DEFAULTS = {
  ink: '#FFFFFF', muted: 'rgba(255,255,255,.78)', accent: '#F2B75F',
  scrimCover: 'linear-gradient(112deg, rgba(20,14,8,.78) 0%, rgba(20,14,8,.42) 46%, rgba(20,14,8,.08) 78%)',
  scrimText: 'linear-gradient(112deg, rgba(18,13,8,.86) 0%, rgba(18,13,8,.55) 55%, rgba(18,13,8,.22) 100%)',
  scrimBottom: 'linear-gradient(180deg, rgba(16,11,6,0) 34%, rgba(16,11,6,.55) 58%, rgba(16,11,6,.92) 100%)',
  chipBg: 'rgba(255,255,255,.14)', chipBorder: 'rgba(255,255,255,.34)',
  labelBg: 'rgba(255,255,255,.92)', labelInk: '#221A10',
  fallbackBg: 'linear-gradient(160deg,#F6EFE3 0%,#EAD9BC 100%)', fallbackInk: '#2A241B',
  headline: 92, title: 76, body: 40, price: 72, radius: 28,
};
function loadTokens() {
  try {
    const t = JSON.parse(readFileSync(join(ROOT, 'data/clients', clientId, 'design-tokens.json'), 'utf8'));
    return { ...TOKEN_DEFAULTS, ...(t.card || {}) };
  } catch { return { ...TOKEN_DEFAULTS }; }
}
const T = loadTokens();

// ── 제품 카탈로그 (지침⑥: 콘텐츠 50% 이상 제품 이미지 → 구매 연결) ──
// data/clients/<id>/product-images.json + docs/products/<id>/<key>.jpg(CI 다운로드)
function loadProducts() {
  try {
    const spec = JSON.parse(readFileSync(join(ROOT, 'data/clients', clientId, 'product-images.json'), 'utf8'));
    const map = {};
    for (const p of spec.products || []) map[p.key] = p;
    return map;
  } catch { return {}; }
}
const PRODUCTS = loadProducts();
const PRODUCT_KEYS = Object.keys(PRODUCTS);
function productPhoto(key) {
  if (!key) return null;
  const f = join(ROOT, 'docs/products', clientId, `${key}.jpg`);
  if (!existsSync(f)) return null;
  try { return `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`; } catch { return null; }
}
const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const br = (s) => esc(s).replace(/\n/g, '<br>');
// *강조* → 앰버 하이라이트
const hl = (s) => br(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

// 배경 실사 선택 — slide.bgKey → slide.productKey → 첫 제품. 없으면 null(폴백 배경).
function bgPhoto(s) {
  return productPhoto(s.bgKey) || productPhoto(s.productKey) || productPhoto(PRODUCT_KEYS[0]);
}

// 단계 라벨 칩 — haysol 릴스의 제품명 라벨 문법 (밝은 칩 + 진한 잉크)
const labelChip = (t) => (t ? `<div class="klabel"><span>${esc(t)}</span></div>` : '');

// 제품 미니 태그 — 텍스트 장 하단에 제품·가격·구매 동선 고정 노출
function productTag(key) {
  const p = PRODUCTS[key];
  if (!p) return '';
  const photo = productPhoto(key);
  const thumb = photo ? `<img class="ptthumb" src="${photo}" alt=""/>` : '';
  return `<div class="ptag">${thumb}<div class="ptxt"><div class="ptname">${esc(p.name)}</div><div class="ptprice">${won(p.price)} · 프로필 링크에서 구매</div></div></div>`;
}

function sceneHTML(item, s, idx) {
  if (s.scene === 'cover' || idx === 0) {
    // 표지 — 실사 풀블리드 + 좌측 큰 헤드라인 + 얇은 구분선/영문 소라벨 + 하단 칩 (레퍼런스 시안 구조)
    return { scrim: T.scrimCover, inner: `<div class="mid cover">
      <div class="headline">${hl(s.title || item.headline || item.topic)}</div>
      <div class="subline"><span class="rule"></span><span class="en">${esc(s.en || 'VITTZ LIGHTING')}</span></div>
      ${s.body ? `<div class="chip">${br(s.body)}</div>` : ''}
    </div>` };
  }
  if (s.scene === 'product') {
    // 제품 장 — 제품 실사 풀블리드 + 하단 오버레이(단계 라벨·제품명·가격·설명·구매)
    const p = PRODUCTS[s.productKey] || {};
    return { scrim: T.scrimBottom, inner: `<div class="mid pbot">
      ${labelChip(s.label || '비츠 제품')}
      <div class="pname">${esc(p.name || s.title || '')}</div>
      ${p.price ? `<div class="pprice">${won(p.price)}</div>` : ''}
      ${s.body ? `<div class="body pbody">${br(s.body)}</div>` : ''}
      <div class="buy">프로필 링크에서 바로 구매 →</div>
    </div>` };
  }
  if (s.scene === 'spec') {
    // 숫자 강조 장 — 진한 스크림 위 큰 숫자 + 제목 + 본문 (+ 제품 태그)
    return { scrim: T.scrimText, inner: `<div class="mid">
      ${labelChip(s.label)}
      ${s.big ? `<div class="big">${hl(s.big)}</div>` : ''}
      <div class="title">${hl(s.title || '')}</div>
      ${s.body ? `<div class="body">${br(s.body)}</div>` : ''}
      ${s.productKey ? productTag(s.productKey) : ''}
    </div>` };
  }
  if (s.scene === 'split') {
    // 비교 장 — 반투명 패널 2단 (지금 / 바꾼 뒤)
    return { scrim: T.scrimText, inner: `<div class="mid">
      ${labelChip(s.label)}
      ${s.title ? `<div class="title" style="margin-bottom:44px">${hl(s.title)}</div>` : ''}
      <div class="split">
        <div class="half"><div class="halfLab">${esc(s.beforeLabel || '지금')}</div><div class="halfTxt">${br(s.before || '')}</div></div>
        <div class="half after"><div class="halfLab">${esc(s.afterLabel || '바꾼 뒤')}</div><div class="halfTxt">${br(s.after || '')}</div></div>
      </div>
      ${s.body ? `<div class="body">${br(s.body)}</div>` : ''}
    </div>` };
  }
  if (s.scene === 'cta') {
    // 마지막 장 — 중앙 CTA (드라이브 지침: 마지막 장 중앙 CTA)
    return { scrim: T.scrimText, inner: `<div class="mid cta">
      <div class="title">${hl(s.title || '')}</div>
      ${s.body ? `<div class="body" style="text-align:center">${br(s.body)}</div>` : ''}
      ${s.productKey ? productTag(s.productKey) : ''}
      <div class="ctaline">비츠 딜리버리 · 배달과 설치를 한 번에</div>
    </div>` };
  }
  // point 및 기타(구 pendant/fan/window/bulbs 호환) — 텍스트 장
  return { scrim: T.scrimText, inner: `<div class="mid">
    ${labelChip(s.label)}
    <div class="title">${hl(s.title || '')}</div>
    ${s.body ? `<div class="body">${br(s.body)}</div>` : ''}
    ${s.productKey ? productTag(s.productKey) : ''}
  </div>` };
}

// ── 공통 프레임 — 실사 배경 + 스크림 + 워드마크/시리즈/핸들/도트 ──
function frame(item, s, scrim, inner, pageNo, pageTotal, handle) {
  const photo = bgPhoto(s);
  const bgLayer = photo
    ? `<img class="bg" src="${photo}" alt=""/><div class="scrim" style="background:${scrim}"></div>`
    : `<div class="bg fb"></div>`;
  const dots = Array.from({ length: pageTotal }, (_, i) =>
    `<span class="dot${i + 1 === pageNo ? ' on' : ''}"></span>`).join('');
  return `<div class="card${photo ? '' : ' nofoto'}">
    ${bgLayer}
    <div class="layer">
      <div class="top"><div class="logo">VITTZ</div><div class="series">${esc(item.series || '비츠')}</div></div>
      ${inner}
      <div class="foot"><div class="handle">${esc(handle)}</div><div class="dots">${dots}</div></div>
    </div>
  </div>`;
}

function pageHTML(item, s, idx, total, handle, faces) {
  const { scrim, inner } = sceneHTML(item, s, idx);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${faces}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px}
body{font-family:'Pretendard';color:${T.ink}}
.card{width:1080px;height:1350px;position:relative;overflow:hidden}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bg.fb{background:${T.fallbackBg}}
.card.nofoto{color:${T.fallbackInk}}
.card.nofoto .handle,.card.nofoto .series,.card.nofoto .body{color:rgba(42,36,27,.66)}
.scrim{position:absolute;inset:0}
.layer{position:absolute;inset:0;padding:84px 88px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:baseline}
.logo{font-weight:800;font-size:33px;letter-spacing:.4em;text-shadow:0 2px 14px rgba(0,0,0,.35)}
.series{font-weight:600;font-size:26px;letter-spacing:.16em;color:${T.muted}}
.mid{flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:44px}
.cover{justify-content:center;padding-bottom:0}
.headline{font-weight:800;font-size:${T.headline}px;line-height:1.24;letter-spacing:-.028em;text-wrap:balance;text-shadow:0 4px 26px rgba(0,0,0,.42)}
.headline em,.title em,.big em{font-style:normal;color:${T.accent}}
.subline{display:flex;align-items:center;gap:26px;margin-top:44px}
.rule{display:block;width:96px;height:2px;background:rgba(255,255,255,.75)}
.en{font-weight:600;font-size:27px;letter-spacing:.34em;color:${T.muted}}
.chip{margin-top:58px;align-self:flex-start;background:${T.chipBg};border:1.5px solid ${T.chipBorder};border-radius:999px;padding:21px 36px;font-size:34px;font-weight:600;line-height:1.45;backdrop-filter:blur(6px)}
.klabel{margin-bottom:32px}
.klabel span{display:inline-block;background:${T.labelBg};color:${T.labelInk};font-weight:700;font-size:28px;letter-spacing:.14em;padding:14px 26px;border-radius:12px}
.title{font-weight:800;font-size:${T.title}px;line-height:1.28;letter-spacing:-.024em;text-wrap:balance;text-shadow:0 4px 22px rgba(0,0,0,.4)}
.body{font-weight:500;font-size:${T.body}px;line-height:1.64;color:${T.muted};margin-top:36px;max-width:94%}
.big{font-weight:800;font-size:150px;letter-spacing:-.03em;color:${T.accent};line-height:1;margin-bottom:24px;text-shadow:0 6px 30px rgba(0,0,0,.35)}
.pbot{justify-content:flex-end}
.pname{font-weight:800;font-size:56px;letter-spacing:-.02em;text-wrap:balance;text-shadow:0 3px 18px rgba(0,0,0,.45)}
.pprice{font-weight:800;font-size:${T.price}px;letter-spacing:-.03em;color:${T.accent};margin-top:10px}
.pbody{margin-top:26px}
.buy{margin-top:30px;align-self:flex-start;background:${T.chipBg};border:1.5px solid ${T.chipBorder};border-radius:999px;padding:16px 32px;font-size:29px;font-weight:700;backdrop-filter:blur(6px)}
.ptag{margin-top:48px;display:flex;align-items:center;gap:24px;background:rgba(0,0,0,.34);border:1.5px solid ${T.chipBorder};border-radius:22px;padding:20px 26px;backdrop-filter:blur(8px);align-self:flex-start}
.ptthumb{width:116px;height:116px;border-radius:16px;object-fit:cover;background:#FFF;flex:none}
.ptname{font-weight:700;font-size:30px;line-height:1.35}
.ptprice{font-weight:600;font-size:27px;color:${T.accent};margin-top:6px}
.split{display:flex;gap:22px}
.half{flex:1;border-radius:${T.radius}px;padding:50px 42px;min-height:400px;display:flex;flex-direction:column;gap:20px;background:rgba(10,8,5,.55);border:1.5px solid rgba(255,255,255,.18);backdrop-filter:blur(8px)}
.half.after{background:rgba(58,40,16,.62);border-color:${T.chipBorder}}
.halfLab{font-weight:700;font-size:27px;letter-spacing:.2em;color:${T.muted}}
.halfTxt{font-weight:600;font-size:36px;line-height:1.55}
.cta{align-items:center;text-align:center;justify-content:center;padding-bottom:0}
.cta .ptag{align-self:center}
.ctaline{margin-top:54px;border-top:1.5px solid rgba(255,255,255,.4);padding-top:32px;font-size:31px;letter-spacing:.06em;color:${T.accent};font-weight:700;width:100%;text-align:center}
.foot{display:flex;justify-content:space-between;align-items:center}
.handle{font-weight:700;font-size:29px;color:${T.muted};text-shadow:0 2px 12px rgba(0,0,0,.4)}
.dots{display:flex;gap:12px}
.dot{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.35)}
.dot.on{background:${T.accent}}
</style></head><body>${frame(item, s, scrim, inner, idx + 1, total, handle)}</body></html>`;
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
  const total = item.slides.length;
  const files = [];
  item.slides.forEach((s, idx) => {
    const file = `${item.id}-${idx + 1}.png`;
    writeFileSync(tmp, pageHTML(item, s, idx, total, handle, faces));
    execFileSync(chromium, [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1080,1350',
      `--screenshot=${join(outDir, file)}`, `file://${tmp}`,
    ], { stdio: 'pipe' });
    files.push(`cards/${clientId}/${file}`);
    n++;
  });
  item.slideImages = files;
  item.cardImage = files[0];
}
try { rmSync(tmp); } catch { /* ignore */ }
writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf8');
console.log(`비츠 실사 풀블리드 카드 ${n}장 렌더 완료 → docs/cards/${clientId}/`);
