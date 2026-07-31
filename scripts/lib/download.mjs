/**
 * 원격 에셋 다운로드 (URL 스탬프 캐시)
 *
 * 왜 fetch 를 그냥 안 쓰나:
 *   Node 의 전역 fetch 는 HTTPS_PROXY 환경변수를 보지 않는다. 프록시 뒤에서 돌아가는
 *   개발/에이전트 환경에서는 힉스필드 CDN 다운로드가 전부 조용히 실패한다
 *   (CI 러너는 직결이라 멀쩡해서, 로컬에서만 깨지는 헷갈리는 증상이 된다).
 *   curl 은 프록시·리다이렉트·CA 번들을 알아서 처리하므로 있으면 curl 을 먼저 쓴다.
 */
import { existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** 에러 페이지가 mp4 로 위장한 경우를 거르는 최소 크기 */
const MIN_BYTES = 2000;

const hasCurl = (() => {
  try { return spawnSync('curl', ['--version'], { stdio: 'ignore' }).status === 0; }
  catch { return false; }
})();

async function viaFetch(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < MIN_BYTES) return false;
  writeFileSync(dest, buf);
  return true;
}

function viaCurl(url, dest) {
  const r = spawnSync('curl', ['-sSL', '--fail', '--max-time', '180', '-o', dest, url], { stdio: 'pipe' });
  if (r.status !== 0) return false;
  if (!existsSync(dest) || statSync(dest).size < MIN_BYTES) { rmSync(dest, { force: true }); return false; }
  return true;
}

/** @returns {Promise<boolean>} 성공 여부 */
export async function download(url, dest) {
  if (hasCurl) return viaCurl(url, dest);
  try { return await viaFetch(url, dest); } catch { return false; }
}

/**
 * 캐시된 파일을 재사용하되, 출처 URL이 바뀌면(재생성) 다시 받는다.
 * @param stampPath 마지막으로 받은 URL 을 적어두는 파일
 */
export async function fetchCached(url, dest, stampPath) {
  const cached = existsSync(dest)
    && existsSync(stampPath)
    && readFileSync(stampPath, 'utf8').trim() === url;
  if (cached) return true;
  const ok = await download(url, dest);
  if (ok) writeFileSync(stampPath, url);
  return ok;
}
