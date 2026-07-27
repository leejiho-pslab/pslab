#!/usr/bin/env node
/**
 * 릴스·쇼츠 멀티씬 합성기 (감도 업그레이드판)
 *
 * 기존 방식(배경 클립 1개 무한루프 + 텍스트 패널)의 단조로움을 없애고,
 * **대본 비트마다 그 문장에 맞는 장면 클립**을 붙여 15초 이내로 합성한다.
 *
 *  비트1(장면A) → 비트2(장면B) → 비트3(장면C) → 비트4(장면D)
 *      크로스페이드로 이어지고, 각 씬에는
 *      · 하단 그라데이션 스크림(가독성)
 *      · 슬라이드업 + 페이드 인/아웃 되는 대형 자막
 *      · 키워드 액센트 컬러 + 밑줄 하이라이트
 *      · 진행 도트 · 브랜드 워터마크
 *      가 얹힌다. 마지막에 BGM과 인/아웃 페이드.
 *
 * 입력: data/clients/<id>/reel-scenes.json (비트 대본 + 장면 클립 URL)
 * 출력: docs/shorts/<itemId>/<itemId>.mp4, plan.json 의 videoFile 갱신
 *
 * 사용: node scripts/build-reels.mjs --client pslab [--only reels-07-27]
 * Chromium/ffmpeg 없으면 건너뛴다(커밋된 영상 유지) — CI를 깨지 않음.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'pslab');
const only = arg('only', '');

function findBin(envKey, cands) {
  if (process.env[envKey] && existsSync(process.env[envKey])) return process.env[envKey];
  if (envKey === 'PSLAB_CHROMIUM' && existsSync('/opt/pw-browsers/chromium')) return '/opt/pw-browsers/chromium';
  for (const c of cands) {
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim() || c; } catch { /* keep */ }
  }
  return null;
}
const chromium = findBin('PSLAB_CHROMIUM', ['chromium', 'chromium-browser', 'google-chrome', 'chrome']);
const ffmpeg = findBin('PSLAB_FFMPEG', ['ffmpeg']);

const FONT_WEIGHTS = { ExtraBold: 800, Bold: 700, SemiBold: 600, Medium: 500 };
function fontFaces() {
  const dir = join(ROOT, 'assets/fonts');
  return Object.entries(FONT_WEIGHTS).map(([w, weight]) => {
    const b64 = readFileSync(join(dir, `Pretendard-${w}.otf`)).toString('base64');
    return `@font-face{font-family:'Pretendard';font-weight:${weight};src:url(data:font/otf;base64,${b64}) format('opentype');}`;
  }).join('\n');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const THEME = {
  cinematic: { accent: '#ff8a3d', kicker: '#ffb37a' },
  premium: { accent: '#ffc24a', kicker: '#ffd98a' },
};

/** 키워드에 액센트 컬러 + 하이라이트 밑줄을 입힌 자막 HTML */
function textHtml(text, accent, t) {
  return esc(text)
    .split('\n')
    .map((line) => {
      let out = line;
      if (accent) {
        const a = esc(accent);
        const i = out.indexOf(a);
        if (i >= 0) out = out.slice(0, i) + `<em>${a}</em>` + out.slice(i + a.length);
      }
      return `<span class="ln">${out}</span>`;
    })
    .join('');
}

/**
 * 씬 자막 오버레이 (1080x1920 투명 PNG)
 * part 'a' = 스크림+키커+1행+도트+브랜드 / part 'b' = 2행만
 * → 두 장을 시차를 두고 얹어 "줄이 차례로 등장"하는 모션을 만든다.
 *   레이아웃은 항상 동일하게 그린 뒤 opacity로만 감춰 위치가 어긋나지 않는다.
 */
function overlayHtml(beat, idx, total, t, part) {
  const mask = part === 'b'
    ? `.top,.scrim,.kicker,.dots,.brand{opacity:0}.ln:nth-of-type(1){opacity:0}`
    : `.ln:nth-of-type(2){opacity:0}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
html,body{width:1080px;height:1920px}
body{font-family:'Pretendard';background:transparent;position:relative;overflow:hidden}
/* 하단 스크림 — 박스 대신 그라데이션으로 자연스러운 가독성 확보 */
.scrim{position:absolute;left:0;right:0;bottom:0;height:1180px;
  background:linear-gradient(180deg,rgba(6,10,18,0) 0%,rgba(6,10,18,.35) 30%,rgba(6,10,18,.80) 62%,rgba(6,10,18,.93) 100%)}
.top{position:absolute;left:0;right:0;top:0;height:420px;
  background:linear-gradient(180deg,rgba(6,10,18,.55) 0%,rgba(6,10,18,0) 100%)}
.kicker{position:absolute;top:150px;left:84px;font-weight:800;font-size:38px;letter-spacing:.28em;
  color:${t.kicker};text-transform:uppercase;text-shadow:0 3px 18px rgba(0,0,0,.7)}
.block{position:absolute;left:84px;right:84px;bottom:520px}
.ln{display:block;font-weight:800;font-size:108px;line-height:1.22;letter-spacing:-.035em;color:#fff;
  word-break:keep-all;text-wrap:pretty;text-shadow:0 6px 30px rgba(0,0,0,.75),0 2px 8px rgba(0,0,0,.6)}
.ln em{font-style:normal;color:${t.accent};position:relative;white-space:nowrap}
.ln em::after{content:'';position:absolute;left:-4px;right:-4px;bottom:6px;height:16px;border-radius:8px;
  background:${t.accent};opacity:.22;z-index:-1}
.dots{position:absolute;left:84px;bottom:440px;display:flex;gap:14px}
.dot{width:56px;height:7px;border-radius:6px;background:rgba(255,255,255,.28)}
.dot.on{background:${t.accent};box-shadow:0 0 16px ${t.accent}}
.brand{position:absolute;left:84px;bottom:352px;font-weight:700;font-size:34px;color:rgba(255,255,255,.72);
  letter-spacing:.02em;text-shadow:0 2px 12px rgba(0,0,0,.7)}
${mask}
</style></head><body>
<div class="top"></div><div class="scrim"></div>
${beat.kicker ? `<div class="kicker">${esc(beat.kicker)}</div>` : ''}
<div class="block">${textHtml(beat.text, beat.accent, t)}</div>
<div class="dots">${Array.from({ length: total }, (_, i) => `<span class="dot${i === idx ? ' on' : ''}"></span>`).join('')}</div>
<div class="brand">@_pslab</div>
</body></html>`;
}

function shoot(html, outPng) {
  const tmp = outPng.replace(/\.png$/, '.html');
  writeFileSync(tmp, html);
  execFileSync(chromium, [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--default-background-color=00000000', '--force-device-scale-factor=1',
    '--window-size=1080,1920', `--screenshot=${outPng}`, `file://${tmp}`,
  ], { stdio: 'pipe' });
  rmSync(tmp, { force: true });
}

async function download(url, dest) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) return false;
    writeFileSync(dest, buf);
    return true;
  } catch { return false; }
}

// ── BGM: 커밋된 음원 우선, 없으면 저작권 0 합성 패드 ──
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function realBgm(id) {
  for (const d of ['assets/bgm', 'docs/bgm']) {
    const p = join(ROOT, d);
    if (!existsSync(p)) continue;
    const files = readdirSync(p).filter((f) => /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f)).sort();
    if (files.length) return join(p, files[hash(id) % files.length]);
  }
  return null;
}
const ROOTS = [146.83, 164.81, 174.61, 185.0, 196.0, 220.0];
function bgmInput(id, total) {
  const f = realBgm(id);
  if (f) return { args: ['-stream_loop', '-1', '-i', f], gain: 0.3, label: '음원' };
  const r = ROOTS[hash(id + 'bgm') % ROOTS.length];
  const n = (x) => x.toFixed(3);
  const expr = `(0.55+0.45*sin(2*PI*0.11*t))*(0.18*sin(2*PI*${n(r / 2)}*t)+0.14*sin(2*PI*${n(r)}*t)`
    + `+0.10*sin(2*PI*${n(r * 1.25)}*t)+0.10*sin(2*PI*${n(r * 1.5)}*t))`;
  return { args: ['-f', 'lavfi', '-i', `aevalsrc=${expr}:s=44100:d=${total}`], gain: 0.48, label: '합성패드' };
}

// ── 씬 1개 합성: 클립 트림 + 그레이딩 + 2행 시차 슬라이드업 자막 ──
// 1행은 즉시, 2행은 0.25초 뒤에 아래에서 올라오며 나타난다(스태거).
function buildScene(clip, ovA, ovB, dur, out) {
  const fo = Math.max(0.1, dur - 0.4);
  const slide = (delay) => `44*clip(1-(t-${delay})/0.40,0,1)`;
  execFileSync(ffmpeg, [
    '-y', '-i', clip, '-loop', '1', '-i', ovA, '-loop', '1', '-i', ovB,
    '-filter_complex',
    // 배경: 30fps · 1080x1920 커버 크롭 · 미세 그레이딩 · 비네트
    `[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,`
    + `trim=0:${dur},setpts=PTS-STARTPTS,eq=contrast=1.06:saturation=1.08:brightness=-0.012,`
    + `vignette=PI/4.5,format=yuv420p[bg];`
    + `[1:v]format=rgba,fade=t=in:st=0.03:d=0.34:alpha=1,fade=t=out:st=${fo.toFixed(2)}:d=0.32:alpha=1[a];`
    + `[2:v]format=rgba,fade=t=in:st=0.28:d=0.34:alpha=1,fade=t=out:st=${fo.toFixed(2)}:d=0.32:alpha=1[b];`
    + `[bg][a]overlay=x=0:y='${slide(0)}':format=auto[m];`
    + `[m][b]overlay=x=0:y='${slide(0.25)}':format=auto[v]`,
    '-map', '[v]', '-an', '-t', String(dur),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', out,
  ], { stdio: 'pipe' });
}

// ── 씬들을 크로스페이드로 이어붙이고 BGM 얹기 ──
function concatScenes(scenes, dur, xf, id, out) {
  const total = +(scenes.length * dur - (scenes.length - 1) * xf).toFixed(2);
  const bg = bgmInput(id, total);
  const inputs = [];
  scenes.forEach((s) => inputs.push('-i', s));
  inputs.push(...bg.args);

  // 컷마다 전환을 바꿔 "편집된 영상"의 리듬을 만든다 (디졸브 ↔ 슬라이드업)
  const TRANS = ['fade', 'slideup', 'fade', 'smoothup'];
  let fg = '';
  let prev = '0:v';
  let off = dur - xf;
  for (let i = 1; i < scenes.length; i++) {
    const label = i === scenes.length - 1 ? 'xv' : `x${i}`;
    fg += `[${prev}][${i}:v]xfade=transition=${TRANS[(i - 1) % TRANS.length]}:duration=${xf}:offset=${off.toFixed(2)}[${label}];`;
    prev = label;
    off = +(off + dur - xf).toFixed(2);
  }
  fg += `[${prev}]fade=t=in:st=0:d=0.35,fade=t=out:st=${(total - 0.45).toFixed(2)}:d=0.45,format=yuv420p[vout];`;
  const fo = Math.max(0, total - 0.9);
  fg += `[${scenes.length}:a]volume=${bg.gain},lowpass=f=2600,afade=t=in:st=0:d=0.7,`
    + `afade=t=out:st=${fo.toFixed(2)}:d=0.9,aformat=channel_layouts=stereo[aout]`;

  execFileSync(ffmpeg, [
    '-y', ...inputs, '-filter_complex', fg,
    '-map', '[vout]', '-map', '[aout]', '-t', String(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
  ], { stdio: 'pipe' });
  return total;
}

// ── 메인 ──
const specPath = join(ROOT, 'data/clients', clientId, 'reel-scenes.json');
if (!existsSync(specPath)) { console.log('reel-scenes.json 없음 → 건너뜀'); process.exit(0); }
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const planPath = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));

if (!chromium || !ffmpeg) {
  console.log(`도구 없음(chromium=${!!chromium}, ffmpeg=${!!ffmpeg}) → 릴스 합성 건너뜀`);
  process.exit(0);
}

const beatSec = spec.defaults?.beatSec ?? 3.5;
const xf = spec.defaults?.xfade ?? 0.3;
let made = 0;

for (const [itemId, cfg] of Object.entries(spec.reels || {})) {
  if (only && only !== itemId) continue;
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) { console.log(`  ${itemId}: plan에 없음 → 건너뜀`); continue; }
  const beats = (cfg.beats || []).filter((b) => b.clip);
  if (beats.length < 2) { console.log(`  ${itemId}: 장면 클립 부족(${beats.length}) → 건너뜀`); continue; }

  const dir = join(ROOT, 'docs/shorts', itemId);
  mkdirSync(dir, { recursive: true });
  const t = THEME[cfg.theme] ?? THEME.cinematic;
  const scenes = [];

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const clip = join(dir, `scene-${i + 1}.mp4`);
    // 캐시는 출처 URL이 같을 때만 재사용 — 장면을 새로 생성해 URL이 바뀌면 다시 받는다
    const stamp = join(dir, `scene-${i + 1}.src`);
    const cached = existsSync(clip) && existsSync(stamp)
      && readFileSync(stamp, 'utf8').trim() === b.clip;
    if (!cached) {
      const ok = await download(b.clip, clip);
      if (!ok) { console.log(`  ${itemId}: 장면${i + 1} 다운로드 실패 → 중단`); scenes.length = 0; break; }
      writeFileSync(stamp, b.clip);
    }
    const ovA = join(dir, `cap-${i + 1}a.png`);
    const ovB = join(dir, `cap-${i + 1}b.png`);
    shoot(overlayHtml(b, i, beats.length, t, 'a'), ovA);
    shoot(overlayHtml(b, i, beats.length, t, 'b'), ovB);
    const scene = join(dir, `_s${i + 1}.mp4`);
    buildScene(clip, ovA, ovB, beatSec, scene);
    scenes.push(scene);
  }
  if (scenes.length < 2) continue;

  const out = join(dir, `${itemId}.mp4`);
  const total = concatScenes(scenes, beatSec, xf, itemId, out);
  scenes.forEach((s) => rmSync(s, { force: true }));
  item.videoFile = `shorts/${itemId}/${itemId}.mp4`;
  item.videoSeconds = total;
  made++;
  console.log(`  ✓ ${itemId}: ${beats.length}씬 · ${total}s → ${itemId}.mp4`);
}

if (made > 0) {
  plan.updatedAt = new Date().toISOString();
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
}
console.log(`릴스 합성 완료: ${made}편`);
