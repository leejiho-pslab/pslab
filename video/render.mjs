#!/usr/bin/env node
/**
 * Remotion 배치 렌더러 — 매니페스트 하나로 여러 릴스를 한 번에 뽑는다.
 *
 * 이 파일은 video/ 안에 있다(Remotion 의존성이 여기에만 있어서다).
 * 데이터 준비·후처리는 상위 저장소의 scripts/render-reels-remotion.mjs 가 맡고,
 * 여기서는 "매니페스트대로 렌더" 한 가지만 한다.
 *
 * 사용: node render.mjs <manifest.json>
 * 매니페스트: { items: [{ itemId, out, props }] }
 *
 * 번들은 한 번만 만들어 전 항목이 재사용한다 (항목마다 번들하면 몇 배 느리다).
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('사용: node render.mjs <manifest.json>');
  process.exit(2);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const items = manifest.items ?? [];
if (items.length === 0) {
  console.log('렌더할 항목 없음');
  process.exit(0);
}

/**
 * 헤드리스 브라우저 확보.
 *
 * 기본은 Remotion 이 관리하는 chrome-headless-shell 이다. 시스템에 깔린 최신 Chrome/
 * Chromium(예: Playwright 번들)은 구 headless 모드가 제거돼 Remotion 이 띄우지 못한다
 * ("Old Headless mode has been removed from the Chrome binary").
 * 굳이 특정 바이너리를 쓰려면 PSLAB_CHROMIUM 에 chrome-headless-shell 경로를 준다.
 */
async function resolveBrowser() {
  const override = process.env.PSLAB_CHROMIUM;
  if (override && existsSync(override)) {
    console.log(`크로미움(지정): ${override}`);
    return override;
  }
  console.log('크로미움: Remotion chrome-headless-shell 확보');
  await ensureBrowser();
  return null;
}

const browserExecutable = await resolveBrowser();

console.log('번들 생성...');
const serveUrl = await bundle({
  entryPoint: resolve('src/index.ts'),
  onProgress: () => {},
});

let ok = 0;
for (const item of items) {
  const { itemId, out, props } = item;
  try {
    const composition = await selectComposition({
      serveUrl,
      id: 'Reel',
      inputProps: props,
      browserExecutable,
    });

    mkdirSync(dirname(out), { recursive: true });

    let lastPct = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: out,
      inputProps: props,
      browserExecutable,
      crf: 20,
      x264Preset: 'medium',
      pixelFormat: 'yuv420p',
      // 무음이라도 오디오 트랙을 채운다 — 일부 플랫폼이 무트랙 mp4 를 거른다
      // (기존 ffmpeg 경로도 anullsrc 로 같은 처리를 했다)
      enforceAudioTrack: true,
      chromiumOptions: { gl: 'swangle' },
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct >= lastPct + 20) {
          lastPct = pct;
          process.stdout.write(`  ${itemId} ${pct}%\n`);
        }
      },
    });

    const sec = +(composition.durationInFrames / composition.fps).toFixed(2);
    console.log(`  ✓ ${itemId}: ${props.scenes.length}씬 · ${sec}s → ${out}`);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${itemId}: ${e.message}`);
  }
}

console.log(`Remotion 렌더 완료: ${ok}/${items.length}편`);
process.exit(ok === items.length ? 0 : 1);
