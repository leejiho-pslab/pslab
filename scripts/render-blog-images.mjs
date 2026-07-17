#!/usr/bin/env node
/**
 * 블로그 본문 이미지 렌더러 (네이버·구글 블로그 삽입용)
 *
 * data/clients/<id>/blog-figures.json 의 도표 스펙을 HTML→Chromium으로 렌더해
 * docs/blog/<postId>/fig-N.png 로 저장한다. 글 내용과 맞는 편집형 인포그래픽
 * (통계/체크리스트/비교/인용/막대)을 한글 깨짐 없이 만든다.
 *
 * 채널별 비주얼을 다르게: naver=밝은 페이퍼톤, blogger=다크 잉크톤
 * → 같은 주제라도 두 블로그의 이미지가 완전히 달라 SEO 품질에 유리.
 *
 * 사용: node scripts/render-blog-images.mjs --client pslab
 * Chromium 없으면 건너뜀(커밋된 이미지 유지).
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

// 채널별 테마 (서로 다른 비주얼)
const THEMES = {
  naver: { bg: '#f7f4ee', panel: '#ffffff', fg: '#1c2533', muted: '#6a7689', accent: '#1f6feb', accent2: '#0aa37a', line: '#e6e0d6', accentCover: '#5aa0ff' },
  blogger: { bg: '#101826', panel: '#16202f', fg: '#f1f5fb', muted: '#90a0b8', accent: '#ff8a3d', accent2: '#36d6c4', line: '#26303f', accentCover: '#ff9d52' },
};

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 가로 16:9 대표이미지(커버) — 배경사진은 오른쪽, 제목은 왼쪽 어두운 안전영역(인물과 안 겹침)
function coverHtml(title, kicker, t, bgB64) {
  const bg = bgB64
    ? `background-image:linear-gradient(90deg,rgba(9,13,22,.97) 0%,rgba(9,13,22,.92) 34%,rgba(9,13,22,.55) 62%,rgba(9,13,22,.15) 88%,rgba(9,13,22,.05) 100%),url(data:image/jpeg;base64,${bgB64});background-size:cover;background-position:right center;`
    : `background:linear-gradient(135deg,#0d1526 0%,#101a2c 100%);`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;word-break:keep-all;overflow-wrap:break-word;text-wrap:pretty}
html,body{width:1600px;height:900px}
.cover{width:1600px;height:900px;position:relative;overflow:hidden;${bg}color:#f4f7fb;font-family:'Pretendard';
  display:flex;flex-direction:column;justify-content:center;padding:0 720px 0 104px}
.bar{position:absolute;left:0;top:0;bottom:0;width:16px;background:${t.accentCover}}
.kicker{font-weight:700;font-size:30px;letter-spacing:.16em;color:${t.accentCover};text-transform:uppercase;margin-bottom:26px}
.title{font-weight:800;font-size:82px;line-height:1.2;letter-spacing:-.03em;max-width:780px;text-shadow:0 4px 26px rgba(0,0,0,.6)}
.brand{position:absolute;left:104px;bottom:60px;font-weight:700;font-size:34px;color:#e3e9f4;opacity:.92;text-shadow:0 2px 12px rgba(0,0,0,.6)}
</style></head><body><div class="cover"><div class="bar"></div>
  <div class="kicker">${esc(kicker)}</div>
  <div class="title">${esc(title)}</div>
  <div class="brand">@_pslab</div>
</div></body></html>`;
}

// 기획안에서 글 제목 확보 (headline → captionBody 첫 # → topic)
function loadTitles() {
  const f = join(ROOT, 'data/clients', clientId, 'plan.json');
  const map = {};
  try {
    const plan = JSON.parse(readFileSync(f, 'utf8'));
    for (const it of plan.items) {
      const h = (String(it.captionBody || '').split('\n').find((l) => l.trim().startsWith('# ')) || '').replace(/^#\s*/, '').trim();
      map[it.id] = (it.headline || h || it.topic || '').replace(/<br>/g, ' ').replace(/\*/g, '').trim();
    }
  } catch { /* ignore */ }
  return map;
}

function figureHtml(fig, t) {
  const head = (kicker, title) =>
    `<div class="kicker">${esc(kicker || 'pslab insight')}</div><div class="ftitle">${esc(title)}</div>`;
  let inner = '';
  if (fig.type === 'stat') {
    inner = head(fig.kicker, fig.title) +
      `<div class="statwrap"><div class="bignum">${esc(fig.value)}</div><div class="statlabel">${esc(fig.label)}</div></div>` +
      (fig.sub ? `<div class="fsub">${esc(fig.sub)}</div>` : '');
  } else if (fig.type === 'checklist') {
    inner = head(fig.kicker, fig.title) +
      '<div class="checks">' + fig.items.map((x) => `<div class="check"><span class="ck">✓</span>${esc(x)}</div>`).join('') + '</div>';
  } else if (fig.type === 'compare') {
    const col = (c, accent) =>
      `<div class="col"><div class="colh" style="color:${accent}">${esc(c.label)}</div>` +
      c.items.map((x) => `<div class="colitem">${esc(x)}</div>`).join('') + '</div>';
    inner = head(fig.kicker, fig.title) +
      `<div class="cmp">${col(fig.left, t.muted)}<div class="vs">VS</div>${col(fig.right, t.accent)}</div>`;
  } else if (fig.type === 'quote') {
    inner = `<div class="qmark">“</div><div class="quote">${esc(fig.text)}</div>` +
      (fig.by ? `<div class="qby">— ${esc(fig.by)}</div>` : '');
  } else if (fig.type === 'steps') {
    inner = head(fig.kicker, fig.title) +
      '<div class="steps">' + fig.steps.map((s, i) =>
        `<div class="step"><div class="stepn">${i + 1}</div><div class="stepb"><div class="stepl">${esc(s.label)}</div><div class="stepd">${esc(s.desc || '')}</div></div></div>`).join('') + '</div>';
  } else if (fig.type === 'bars') {
    const mx = Math.max(...fig.bars.map((b) => b.pct), 1);
    inner = head(fig.kicker, fig.title) +
      '<div class="bars">' + fig.bars.map((b) =>
        `<div class="barrow"><div class="barlab">${esc(b.label)}</div><div class="bartrack"><div class="barfill" style="width:${(b.pct / mx) * 100}%"></div></div><div class="barval">${esc(b.val || b.pct + '%')}</div></div>`).join('') + '</div>';
  } else {
    inner = head(fig.kicker, fig.title || '');
  }
  return `<div class="fig ${fig.type}">${inner}<div class="brand">@_pslab</div></div>`;
}

function pageHtml(fig, t) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body{width:1200px;height:675px}
body{font-family:'Pretendard';background:${t.bg};display:flex;align-items:center;justify-content:center}
.fig{width:1200px;height:675px;background:${t.bg};color:${t.fg};padding:74px 84px;position:relative;display:flex;flex-direction:column;justify-content:center}
.kicker{font-weight:700;font-size:24px;letter-spacing:.2em;color:${t.accent};text-transform:uppercase;margin-bottom:18px}
.ftitle{font-weight:800;font-size:60px;line-height:1.2;letter-spacing:-.02em;margin-bottom:36px;word-break:keep-all;text-wrap:pretty}
.fsub{font-weight:500;font-size:30px;color:${t.muted};margin-top:26px;word-break:keep-all}
.brand{position:absolute;right:84px;bottom:60px;font-weight:700;font-size:24px;color:${t.muted}}
/* stat */
.statwrap{display:flex;align-items:baseline;gap:30px}
.bignum{font-weight:800;font-size:200px;line-height:.9;color:${t.accent};letter-spacing:-.04em}
.statlabel{font-weight:600;font-size:40px;color:${t.fg};word-break:keep-all;max-width:520px}
/* checklist */
.checks{display:flex;flex-direction:column;gap:22px}
.check{display:flex;align-items:flex-start;gap:20px;font-weight:600;font-size:38px;line-height:1.35;word-break:keep-all}
.ck{flex:0 0 auto;width:50px;height:50px;border-radius:14px;background:${t.accent2};color:#fff;font-size:30px;display:flex;align-items:center;justify-content:center;margin-top:2px}
/* compare */
.cmp{display:flex;align-items:stretch;gap:30px}
.col{flex:1;background:${t.panel};border:1px solid ${t.line};border-radius:22px;padding:34px 32px}
.colh{font-weight:800;font-size:36px;margin-bottom:22px}
.colitem{font-weight:500;font-size:30px;color:${t.fg};line-height:1.5;padding:9px 0;border-top:1px solid ${t.line};word-break:keep-all}
.colitem:first-of-type{border-top:none}
.vs{align-self:center;font-weight:800;font-size:34px;color:${t.muted}}
/* quote */
.qmark{font-weight:800;font-size:180px;color:${t.accent};line-height:.6;height:90px}
.quote{font-weight:800;font-size:64px;line-height:1.3;letter-spacing:-.02em;word-break:keep-all;text-wrap:pretty}
.qby{font-weight:600;font-size:32px;color:${t.muted};margin-top:30px}
/* steps */
.steps{display:flex;flex-direction:column;gap:24px}
.step{display:flex;align-items:center;gap:26px}
.stepn{flex:0 0 auto;width:64px;height:64px;border-radius:50%;background:${t.accent};color:#fff;font-weight:800;font-size:32px;display:flex;align-items:center;justify-content:center}
.stepl{font-weight:700;font-size:36px;word-break:keep-all}
.stepd{font-weight:500;font-size:26px;color:${t.muted};word-break:keep-all}
/* bars */
.bars{display:flex;flex-direction:column;gap:26px}
.barrow{display:flex;align-items:center;gap:24px}
.barlab{flex:0 0 220px;font-weight:600;font-size:32px;word-break:keep-all}
.bartrack{flex:1;height:46px;background:${t.panel};border:1px solid ${t.line};border-radius:12px;overflow:hidden}
.barfill{height:100%;background:${t.accent};border-radius:12px}
.barval{flex:0 0 auto;font-weight:800;font-size:34px;color:${t.accent}}
</style></head><body>${figureHtml(fig, t)}</body></html>`;
}

const chromium = findChromium();
const specFile = join(ROOT, 'data/clients', clientId, 'blog-figures.json');
if (!existsSync(specFile)) {
  console.log(`블로그 도표 스펙 없음: ${specFile} — 건너뜀`);
  process.exit(0);
}
const specs = JSON.parse(readFileSync(specFile, 'utf8'));
if (!chromium) {
  console.log('Chromium 없음 → 블로그 이미지 렌더 건너뜀 (커밋된 이미지 유지)');
  process.exit(0);
}

const titles = loadTitles();
const KICKER = { 'naver-blog': 'pslab · 광고 인사이트', naver: 'pslab · 광고 인사이트', blogger: 'pslab journal' };

let n = 0;
for (const post of specs) {
  const t = THEMES[post.channel] ?? THEMES.naver;
  const outDir = join(ROOT, 'docs/blog', post.id);
  mkdirSync(outDir, { recursive: true });
  const tmp = join(outDir, '_tmp.html');
  post.figures.forEach((fig, i) => {
    const file = `fig-${i + 1}.png`;
    writeFileSync(tmp, pageHtml(fig, t));
    execFileSync(chromium, [
      '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1200,675',
      `--screenshot=${join(outDir, file)}`, `file://${tmp}`,
    ], { stdio: 'pipe' });
    n++;
  });
  // 가로 16:9 대표이미지(커버) — 네이버 대표이미지/블로그 헤더용
  const bgFile = join(ROOT, 'docs/bg', `${post.id}.jpg`);
  const bgB64 = existsSync(bgFile) ? readFileSync(bgFile).toString('base64') : '';
  const title = titles[post.id] || post.id;
  writeFileSync(tmp, coverHtml(title, KICKER[post.channel] || 'pslab', t, bgB64));
  execFileSync(chromium, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1600,900',
    `--screenshot=${join(outDir, 'cover.png')}`, `file://${tmp}`,
  ], { stdio: 'pipe' });
  try { rmSync(tmp); } catch { /* ignore */ }
  console.log(`  ${post.id} (${post.channel}): ${post.figures.length}장 + 커버`);
}
console.log(`블로그 이미지 ${n}장 렌더 완료 → docs/blog/`);
