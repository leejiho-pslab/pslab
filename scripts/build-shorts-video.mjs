#!/usr/bin/env node
/**
 * 유튜브 쇼츠 영상 합성기 (ffmpeg)
 *
 * docs/shorts/<id>/slide-N.png 들을 이어붙여 세로 9:16 mp4로 만든다.
 *  - 슬라이드당 약 4초
 *  - BGM 자동 삽입(무료): assets/bgm/ 에 음원(mp3 등)이 있으면 그것을, 없으면
 *    ffmpeg로 부드러운 앰비언트 패드를 생성해 깐다(저작권 0·외부 의존 0).
 *    항목마다 코드(루트음)를 회전시켜 영상마다 살짝 다른 분위기.
 *  - 결과: docs/shorts/<id>/<id>.mp4, plan.json 의 youtube 항목에 videoFile 경로 기록
 *
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
const SEC = Number(arg('seconds', '4')); // 슬라이드당 초

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

// ffmpeg로 만드는 부드러운 앰비언트 패드 — 항목별 루트음 회전(저작권 0)
// 루트(베이스 옥타브 아래) + 루트 + 장3도 + 5도 화음을 사인파로 합성, 느린 스웰.
const BGM_ROOTS = [146.83, 164.81, 174.61, 185.0, 196.0, 220.0]; // D3 E3 F3 F#3 G3 A3
function synthExpr(itemId) {
  const f = BGM_ROOTS[hash(itemId + 'bgm') % BGM_ROOTS.length];
  const r = (x) => x.toFixed(3);
  // 0.55~1.0 사이로 천천히 부풀었다 줄어드는 패드
  return `(0.55+0.45*sin(2*PI*0.1*t))*(`
    + `0.18*sin(2*PI*${r(f / 2)}*t)`
    + `+0.14*sin(2*PI*${r(f)}*t)`
    + `+0.10*sin(2*PI*${r(f * 1.25)}*t)`
    + `+0.10*sin(2*PI*${r(f * 1.5)}*t))`;
}

const FILE = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(FILE, 'utf8'));
const items = plan.items.filter((i) => i.channels[0] === 'youtube');

if (!ffmpeg) { console.log('ffmpeg 없음 → 쇼츠 영상 합성 건너뜀 (슬라이드만 유지)'); process.exit(0); }

let made = 0;
for (const it of items) {
  const dir = join(ROOT, 'docs/shorts', it.id);
  if (!existsSync(dir)) { console.log(`  ${it.id}: 슬라이드 없음 → 건너뜀`); continue; }
  const slides = readdirSync(dir).filter((f) => /^slide-\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!slides.length) { console.log(`  ${it.id}: 슬라이드 없음`); continue; }

  // concat 데모서용 리스트 (마지막 슬라이드는 duration 적용 위해 한 번 더 명시)
  const list = [];
  for (const s of slides) { list.push(`file '${s}'`); list.push(`duration ${SEC}`); }
  list.push(`file '${slides[slides.length - 1]}'`);
  const listFile = join(dir, 'list.txt');
  writeFileSync(listFile, list.join('\n'));

  const out = join(dir, `${it.id}.mp4`);
  const total = slides.length * SEC;
  const fadeOut = Math.max(0, total - 0.8);
  // BGM 오디오 입력: 커밋된 음원이 있으면 그것(루프), 없으면 합성 패드
  const bgmFile = realBgm(it.id);
  const audioIn = bgmFile
    ? ['-stream_loop', '-1', '-i', bgmFile]
    : ['-f', 'lavfi', '-i', `aevalsrc=${synthExpr(it.id)}:s=44100:d=${total}`];
  // 커밋 음원은 보통 풀볼륨이라 더 낮추고, 합성 패드는 적당히. 둘 다 페이드.
  const aGain = bgmFile ? '0.32' : '0.5';
  const af = `volume=${aGain},lowpass=f=2400,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOut}:d=0.8,aformat=channel_layouts=stereo`;
  try {
    execFileSync(ffmpeg, [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      ...audioIn,
      '-t', String(total),
      '-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${total - 0.4}:d=0.4`,
      '-af', af,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart',
      out,
    ], { stdio: 'pipe' });
    // plan.json 에 영상 경로 기록 (대시보드 다운로드용)
    it.videoFile = `shorts/${it.id}/${it.id}.mp4`;
    made++;
    console.log(`  ${it.id}: ${slides.length}장 → ${it.id}.mp4 (${total}s, BGM ${bgmFile ? '음원' : '합성패드'})`);
  } catch (err) {
    console.log(`  ${it.id}: 합성 실패 (${err instanceof Error ? err.message : err})`);
  }
}

if (made > 0) {
  plan.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(plan, null, 2), 'utf8');
}
console.log(`쇼츠 영상 ${made}개 합성 완료 → docs/shorts/`);
