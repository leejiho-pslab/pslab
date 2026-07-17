#!/usr/bin/env node
/**
 * 유튜브 쇼츠 영상 합성기 (ffmpeg)
 *
 * 우선순위:
 *  1) 모션 영상 모드 — data/clients/<id>/video-sources.json 에 항목별 클립 URL이 있으면
 *     CI에서 받아(docs/shorts/<id>/clip.mp4) "부메랑(정방향+역방향) 끊김없는 배경" 위에
 *     투명 텍스트 오버레이(ov-N.png: 후킹→요점→CTA)를 타임드로 얹는다. = 스트리밍되는 영상
 *  2) 폴백 — 클립이 없으면 단색 슬라이드(slide-N.png)를 이어붙인 슬라이드쇼.
 * 두 모드 모두 무료 BGM(assets/bgm 음원 또는 ffmpeg 합성 패드)을 자동 삽입.
 *
 * 결과: docs/shorts/<id>/<id>.mp4, plan.json 의 youtube 항목에 videoFile 기록.
 * ffmpeg 없으면 건너뜀(커밋된 영상 유지). GitHub Actions ubuntu 러너엔 기본 설치.
 * 사용: node scripts/build-shorts-video.mjs --client pslab
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'pslab');
const SEC = Number(arg('seconds', '4')); // 폴백 슬라이드당 초
const PER = Number(arg('per', '2.4'));    // 모션모드 오버레이 1장당 초

function findFfmpeg() {
  if (process.env.PSLAB_FFMPEG && existsSync(process.env.PSLAB_FFMPEG)) return process.env.PSLAB_FFMPEG;
  for (const c of ['ffmpeg', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    try { return execFileSync('which', [c], { encoding: 'utf8' }).trim() || c; } catch { /* keep */ }
  }
  return null;
}
const ffmpeg = findFfmpeg();

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

// 커밋된 무료 음원(있으면 최우선) — assets/bgm 또는 docs/bgm 에 mp3 등을 넣으면 회전 사용
function realBgm(itemId) {
  for (const d of ['assets/bgm', 'docs/bgm']) {
    const p = join(ROOT, d);
    if (!existsSync(p)) continue;
    const files = readdirSync(p).filter((f) => /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f)).sort();
    if (files.length) return join(p, files[hash(itemId) % files.length]);
  }
  return null;
}

// ffmpeg 합성 앰비언트 패드 — 항목별 루트음 회전(저작권 0)
const BGM_ROOTS = [146.83, 164.81, 174.61, 185.0, 196.0, 220.0]; // D3 E3 F3 F#3 G3 A3
function synthExpr(itemId) {
  const f = BGM_ROOTS[hash(itemId + 'bgm') % BGM_ROOTS.length];
  const r = (x) => x.toFixed(3);
  return `(0.55+0.45*sin(2*PI*0.1*t))*(`
    + `0.18*sin(2*PI*${r(f / 2)}*t)`
    + `+0.14*sin(2*PI*${r(f)}*t)`
    + `+0.10*sin(2*PI*${r(f * 1.25)}*t)`
    + `+0.10*sin(2*PI*${r(f * 1.5)}*t))`;
}
// BGM 입력 인자 + 게인. 합성패드는 길이 지정(d), 음원파일은 무한루프.
function bgmInput(itemId, total) {
  const file = realBgm(itemId);
  if (file) return { args: ['-stream_loop', '-1', '-i', file], gain: 0.32, label: '음원' };
  return { args: ['-f', 'lavfi', '-i', `aevalsrc=${synthExpr(itemId)}:s=44100:d=${total}`], gain: 0.5, label: '합성패드' };
}
function afChain(gain, total) {
  const fo = Math.max(0, total - 0.8);
  return `volume=${gain},lowpass=f=2400,afade=t=in:st=0:d=0.8,afade=t=out:st=${fo}:d=0.8,aformat=channel_layouts=stereo`;
}

// 미리 생성한 모션 클립 URL 목록
function loadVideoSources() {
  const f = join(ROOT, 'data/clients', clientId, 'video-sources.json');
  if (!existsSync(f)) return {};
  try { const j = JSON.parse(readFileSync(f, 'utf8')); return j.clips || {}; } catch { return {}; }
}
async function downloadClip(url, dest) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000) return false;
    writeFileSync(dest, buf);
    return true;
  } catch { return false; }
}

const FILE = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(FILE, 'utf8'));
const items = plan.items.filter((i) => i.channels[0] === 'youtube');
const sources = loadVideoSources();

if (!ffmpeg) { console.log('ffmpeg 없음 → 쇼츠 영상 합성 건너뜀 (슬라이드만 유지)'); process.exit(0); }

// ── 모션 영상 모드: 부메랑 배경 + 타임드 오버레이 + BGM ──
function buildMotion(it, dir, clip, overlays) {
  const M = overlays.length;
  const total = +(M * PER).toFixed(2);
  // 1패스: 끊김없는 부메랑(정방향+역방향) 배경 생성
  const boom = join(dir, '_boom.mp4');
  execFileSync(ffmpeg, [
    '-y', '-i', clip,
    '-filter_complex',
    `[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setpts=PTS-STARTPTS[v];`
    + `[v]split[a][b];[b]reverse[rb];[a][rb]concat=n=2:v=1,format=yuv420p[out]`,
    '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', boom,
  ], { stdio: 'pipe' });

  // 2패스: 부메랑 무한루프 + 오버레이 합성 + BGM
  const bg = bgmInput(it.id, total);
  const inputs = ['-stream_loop', '-1', '-i', boom];
  overlays.forEach((p) => inputs.push('-i', p)); // 입력 1..M
  inputs.push(...bg.args);                        // 입력 M+1

  // 필터그래프: 배경 위에 오버레이를 시간창으로 차례로 합성
  let fg = '';
  let prev = '0:v';
  for (let i = 0; i < M; i++) {
    const st = +(i * PER).toFixed(2);
    const en = +((i + 1) * PER).toFixed(2);
    const out = i === M - 1 ? 'ovd' : `o${i}`;
    fg += `[${prev}][${i + 1}:v]overlay=0:0:enable='between(t,${st},${en})'[${out}];`;
    prev = out;
  }
  fg += `[ovd]fade=t=in:st=0:d=0.4,fade=t=out:st=${(total - 0.4).toFixed(2)}:d=0.4,format=yuv420p[vout];`;
  fg += `[${M + 1}:a]${afChain(bg.gain, total)}[aout]`;

  const out = join(dir, `${it.id}.mp4`);
  execFileSync(ffmpeg, [
    '-y', ...inputs,
    '-filter_complex', fg,
    '-map', '[vout]', '-map', '[aout]', '-t', String(total),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
    out,
  ], { stdio: 'pipe' });
  try { execFileSync('rm', ['-f', boom]); } catch { /* ignore */ }
  return { total, bgm: bg.label };
}

// ── 폴백: 단색 슬라이드쇼 + BGM ──
function buildSlideshow(it, dir, slides) {
  const list = [];
  for (const s of slides) { list.push(`file '${s}'`); list.push(`duration ${SEC}`); }
  list.push(`file '${slides[slides.length - 1]}'`);
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, list.join('\n'));
  const total = slides.length * SEC;
  const bg = bgmInput(it.id, total);
  const out = join(dir, `${it.id}.mp4`);
  execFileSync(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile, ...bg.args, '-t', String(total),
    '-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${total - 0.4}:d=0.4`,
    '-af', afChain(bg.gain, total),
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
    out,
  ], { stdio: 'pipe' });
  return { total, bgm: bg.label };
}

let made = 0;
for (const it of items) {
  const dir = join(ROOT, 'docs/shorts', it.id);
  if (!existsSync(dir)) { console.log(`  ${it.id}: 슬라이드 없음 → 건너뜀`); continue; }

  // 오버레이(모션모드용) 수집
  const overlays = readdirSync(dir).filter((f) => /^ov-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((f) => join(dir, f));

  // 모션 클립 확보(있으면): 캐시 없으면 URL에서 다운로드
  const clip = join(dir, 'clip.mp4');
  if (!existsSync(clip) && sources[it.id]) {
    const ok = await downloadClip(sources[it.id], clip);
    console.log(`  ${it.id}: 클립 다운로드 ${ok ? '성공' : '실패'}`);
  }

  try {
    let r;
    if (existsSync(clip) && overlays.length) {
      r = buildMotion(it, dir, clip, overlays);
      console.log(`  ${it.id}: 모션영상 ${overlays.length}오버레이 → ${it.id}.mp4 (${r.total}s, BGM ${r.bgm})`);
    } else {
      const slides = readdirSync(dir).filter((f) => /^slide-\d+\.png$/.test(f))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
        .map((f) => f);
      if (!slides.length) { console.log(`  ${it.id}: 소스 없음`); continue; }
      r = buildSlideshow(it, dir, slides);
      console.log(`  ${it.id}: 슬라이드쇼 ${slides.length}장 → ${it.id}.mp4 (${r.total}s, BGM ${r.bgm})`);
    }
    it.videoFile = `shorts/${it.id}/${it.id}.mp4`;
    made++;
  } catch (err) {
    console.log(`  ${it.id}: 합성 실패 (${err instanceof Error ? err.message : err})`);
  }
}

if (made > 0) {
  plan.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(plan, null, 2), 'utf8');
}
console.log(`쇼츠 영상 ${made}개 합성 완료 → docs/shorts/`);
