#!/usr/bin/env node
/**
 * 유튜브 쇼츠 영상 합성기 (ffmpeg)
 *
 * docs/shorts/<id>/slide-N.png 들을 이어붙여 세로 9:16 mp4로 만든다.
 *  - 슬라이드당 약 4초, 무음 오디오 트랙 포함(업로드 시 유튜브 무료 음악 추가 권장)
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
  try {
    execFileSync(ffmpeg, [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', String(total),
      '-vf', `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${total - 0.4}:d=0.4`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
      out,
    ], { stdio: 'pipe' });
    // plan.json 에 영상 경로 기록 (대시보드 다운로드용)
    it.videoFile = `shorts/${it.id}/${it.id}.mp4`;
    made++;
    console.log(`  ${it.id}: ${slides.length}장 → ${it.id}.mp4 (${total}s)`);
  } catch (err) {
    console.log(`  ${it.id}: 합성 실패 (${err instanceof Error ? err.message : err})`);
  }
}

if (made > 0) {
  plan.updatedAt = new Date().toISOString();
  writeFileSync(FILE, JSON.stringify(plan, null, 2), 'utf8');
}
console.log(`쇼츠 영상 ${made}개 합성 완료 → docs/shorts/`);
