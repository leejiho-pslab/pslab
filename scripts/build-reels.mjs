#!/usr/bin/env node
/**
 * 릴스·쇼츠 멀티씬 합성기 (무음판) — ffmpeg 경로 【폴백】
 *
 * ※ 기본 엔진은 Remotion 이다: scripts/render-reels-remotion.mjs
 *    이 스크립트는 Remotion 렌더가 실패했을 때만 CI 에서 돌아간다.
 *    테마 팔레트는 scripts/lib/reel-timeline.mjs 를 공유해 두 엔진의 색이 갈라지지 않게 했다.
 *
 * 대본 비트마다 그 문장에 맞는 장면 클립을 붙여 15초 이내로 합성한다.
 * 오디오는 당분간 넣지 않는다(BGM·음성 내레이션 모두 보류 — 시도해본 결과
 * 톤이 어색해 품질이 떨어짐. 추후 다시 디벨롭 예정). 컨테이너 호환성을 위해
 * 무음 오디오 트랙만 채운다.
 *
 *  비트1(장면A) → 비트2(장면B) → 비트3(장면C) → 비트4(장면D)
 *      크로스페이드로 이어지고, 각 씬에는
 *      · 하단 그라데이션 스크림(가독성)
 *      · 슬라이드업 + 페이드 인/아웃 되는 대형 자막
 *      · 키워드 액센트 컬러 + 밑줄 하이라이트
 *      · 진행 도트 · 브랜드 워터마크
 *      가 얹힌다.
 *
 * 입력: data/clients/<id>/reel-scenes.json (비트 대본 + 장면 클립 URL)
 * 출력: docs/shorts/<itemId>/<itemId>.mp4, plan.json 의 videoFile 갱신
 *
 * 사용: node scripts/build-reels.mjs --client pslab [--only reels-07-27]
 * Chromium/ffmpeg 없으면 건너뛴다(커밋된 영상 유지) — CI를 깨지 않음.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeTheme } from './lib/reel-timeline.mjs';
import { fetchCached } from './lib/download.mjs';

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

// 자막 테마 — 기본 팔레트는 scripts/lib/reel-timeline.mjs 에 하나만 두고 여기서 가져온다.
// (여기 따로 두면 Remotion 경로와 색이 갈라져 폴백이 폴백 구실을 못 한다)
// 실제 값은 design-tokens.json 의 reels 섹션이 덮어쓴다.
// (레퍼런스 학습 결과가 카드뿐 아니라 릴스 자막에도 흐르게 하는 지점. §0 변수 #4)
// 스키마: { "reels": { "cinematic": { "accent": "#...", "kicker": "#..." }, ... } }
function loadReelTokens(id) {
  const f = join(ROOT, 'data/clients', id, 'design-tokens.json');
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8')).reels ?? null;
  } catch (e) {
    console.warn(`design-tokens.json 파싱 실패 — 기본 테마 사용 (${e.message})`);
    return null;
  }
}
const REEL_TOKENS = loadReelTokens(clientId);
const THEME = mergeTheme(REEL_TOKENS);
if (REEL_TOKENS) console.log(`릴스 디자인 토큰 적용: data/clients/${clientId}/design-tokens.json`);

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

// ── 씬 1개 합성: 클립 트림 + 그레이딩 + 2행 시차 슬라이드업 자막 (오디오 없음) ──
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

// ── 씬들을 크로스페이드로 이어붙인다. 오디오는 무음 트랙(컨테이너 호환용)만 채운다 ──
function concatScenes(scenes, dur, xf, out) {
  const n = scenes.length;
  const total = +(n * dur - (n - 1) * xf).toFixed(2);

  const inputs = [];
  scenes.forEach((s) => inputs.push('-i', s));

  // 컷마다 전환을 바꿔 "편집된 영상"의 리듬을 만든다 (디졸브 ↔ 슬라이드업)
  const TRANS = ['fade', 'slideup', 'fade', 'smoothup'];
  let fg = '';
  let prev = '0:v';
  let off = dur - xf;
  for (let i = 1; i < n; i++) {
    const label = i === n - 1 ? 'xv' : `x${i}`;
    fg += `[${prev}][${i}:v]xfade=transition=${TRANS[(i - 1) % TRANS.length]}:duration=${xf}:offset=${off.toFixed(2)}[${label}];`;
    prev = label;
    off = +(off + dur - xf).toFixed(2);
  }
  fg += `[${prev}]fade=t=in:st=0:d=0.35,fade=t=out:st=${(total - 0.45).toFixed(2)}:d=0.45,format=yuv420p[vout]`;

  execFileSync(ffmpeg, [
    '-y', ...inputs, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-filter_complex', fg,
    '-map', '[vout]', '-map', `${n}:a`, '-t', String(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', out,
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
  // 아직 클립이 준비되지 않은 비트는 건너뛴다 (부분 완성 상태에서도 나머지로 합성)
  const beats = (cfg.beats || []).filter((b) => /^https?:\/\//.test(b.clip ?? ''));
  if (beats.length < 2) { console.log(`  ${itemId}: 장면 클립 부족(${beats.length}) → 건너뜀`); continue; }

  const dir = join(ROOT, 'docs/shorts', itemId);
  mkdirSync(dir, { recursive: true });
  const t = THEME[cfg.theme] ?? THEME.cinematic;
  const scenes = [];

  for (let i = 0; i < beats.length; i++) {
    const b = beats[i];
    const clip = join(dir, `scene-${i + 1}.mp4`);
    const okClip = await fetchCached(b.clip, clip, join(dir, `scene-${i + 1}.src`));
    if (!okClip) { console.log(`  ${itemId}: 장면${i + 1} 다운로드 실패 → 중단`); scenes.length = 0; break; }

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
  const total = concatScenes(scenes, beatSec, xf, out);
  scenes.forEach((s) => rmSync(s, { force: true }));
  item.videoFile = `shorts/${itemId}/${itemId}.mp4`;
  item.videoSeconds = total;
  made++;
  console.log(`  ✓ ${itemId}: ${beats.length}씬(무음) · ${total}s → ${itemId}.mp4`);
}

// ── 영상 재사용: videoFrom 이 가리키는 항목의 영상을 그대로 쓴다 ──
// (같은 콘텐츠를 인스타 릴스와 유튜브 쇼츠에 동시 발행할 때 중복 합성을 피한다)
let linked = 0;
for (const it of plan.items) {
  if (!it.videoFrom) continue;
  const src = plan.items.find((x) => x.id === it.videoFrom);
  if (!src?.videoFile) { console.log(`  ${it.id}: 원본(${it.videoFrom}) 영상 없음 → 대기`); continue; }
  if (it.videoFile !== src.videoFile) { it.videoFile = src.videoFile; linked++; }
  if (src.videoSeconds) it.videoSeconds = src.videoSeconds;
}
if (linked > 0) console.log(`  영상 재사용 연결: ${linked}건`);

if (made > 0 || linked > 0) {
  plan.updatedAt = new Date().toISOString();
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
}
console.log(`릴스 합성 완료: ${made}편`);
