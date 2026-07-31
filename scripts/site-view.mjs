#!/usr/bin/env node
/**
 * 사이트 열람 도구 — 네이버·유튜브·인스타그램 등 웹페이지를 실제 브라우저로
 * 열어 스크린샷을 찍거나, 인스타그램 릴스의 영상을 받아 프레임으로 저장한다.
 * (Claude가 링크 내용을 "직접 보고" 확인하는 용도 — 원격 세션 전용)
 *
 * 사용:
 *   node scripts/site-view.mjs shot <url> [out.png]        # 페이지 스크린샷
 *   node scripts/site-view.mjs reel <릴스url> [outdir]      # 릴스 mp4 + 3초 간격 프레임
 *
 * 필요: playwright (없으면: npm i --no-save playwright), ffmpeg.
 * 크로미움: /opt/pw-browsers/chromium (원격 세션에 사전 설치됨).
 *
 * 주의(원격 세션 프록시): 이 환경의 에이전트 프록시는 크로미움의 TLS1.3
 * ClientHello를 리셋한다 — 반드시 TLS1.2 강제 + HTTP/2·QUIC 비활성 플래그로
 * 실행해야 페이지가 열린다(아래 ARGS). 네트워크 정책이 '전체'여야 외부
 * 사이트에 닿는다(2026-07-30 소장님이 변경 완료).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , cmd, url, outArg] = process.argv;
if (!cmd || !url) {
  console.log('사용: site-view.mjs shot|reel <url> [out]');
  process.exit(1);
}

const { chromium } = await import('playwright').catch(() => {
  console.error('playwright가 없습니다: npm i --no-save playwright 후 재실행');
  process.exit(1);
});

const ARGS = [
  '--no-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  '--ssl-version-max=tls1.2', // 프록시 MITM이 TLS1.3 hello를 리셋 — 필수
  '--disable-http2',
  '--disable-quic',
];

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
  args: ARGS,
});
const ctx = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 900 },
  locale: 'ko-KR',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
});

try {
  if (cmd === 'shot') {
    const out = outArg ?? 'page.png';
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`저장: ${out} — ${await page.title()}`);
  } else if (cmd === 'reel') {
    // 릴스 본 페이지가 아닌 /embed/ 페이지가 로그인 없이 영상을 서빙한다.
    const embed = url.replace(/\/?(\?.*)?$/, '').replace(/\/embed$/, '') + '/embed/';
    const outDir = outArg ?? 'reel-frames';
    mkdirSync(outDir, { recursive: true });
    const page = await ctx.newPage();
    const media = new Set();
    page.on('response', (r) => {
      const u = r.url();
      if (u.includes('.mp4') || (r.headers()['content-type'] || '').startsWith('video/'))
        media.add(u.split('&bytestart')[0]);
    });
    await page.goto(embed, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.click('body').catch(() => {});
    await page.waitForTimeout(4000);
    for (const src of await page.evaluate(() =>
      [...document.querySelectorAll('video')].map((v) => v.currentSrc || v.src).filter(Boolean),
    ))
      media.add(src);
    const mp4 = [...media][0];
    if (!mp4) throw new Error('영상 URL을 찾지 못했습니다 (비공개이거나 로그인 필요 콘텐츠일 수 있음)');
    const mp4Path = join(outDir, 'reel.mp4');
    execFileSync('curl', ['-sSL', '--max-time', '120', '-o', mp4Path, mp4]);
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', mp4Path,
      '-vf', "select='eq(n\\,0)+gte(t-prev_selected_t\\,3)',scale=360:-1",
      '-vsync', 'vfr', join(outDir, 'frame-%d.png'),
    ]);
    console.log(`저장: ${outDir}/ (reel.mp4 + frame-*.png)`);
  } else {
    console.log(`알 수 없는 명령: ${cmd}`);
  }
} finally {
  await browser.close();
}
