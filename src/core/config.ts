import 'dotenv/config';
import type { PlatformId, PluginCredentials } from './types.js';

/**
 * 환경 변수에서 플랫폼별 자격 증명을 읽는다.
 *
 * 규칙: PSLAB_<PLATFORM>_<KEY> (대문자, 하이픈은 _).
 * 예) PSLAB_YOUTUBE_CLIENT_ID, PSLAB_NAVER_BLOG_ACCESS_TOKEN
 */

const CREDENTIAL_KEYS: Record<PlatformId, string[]> = {
  youtube: ['clientId', 'clientSecret', 'refreshToken', 'channelId'],
  'naver-blog': ['clientId', 'clientSecret', 'accessToken', 'blogId'],
  blogger: ['clientId', 'clientSecret', 'refreshToken', 'blogId'],
  instagram: ['accessToken', 'igUserId'],
  threads: ['accessToken', 'threadsUserId'],
  linkedin: ['accessToken', 'authorUrn'],
};

function envKey(platform: PlatformId, camelKey: string): string {
  const plat = platform.toUpperCase().replace(/-/g, '_');
  const key = camelKey.replace(/([A-Z])/g, '_$1').toUpperCase();
  return `PSLAB_${plat}_${key}`;
}

/** 한 플랫폼의 자격 증명을 환경 변수에서 모은다. */
export function loadCredentials(platform: PlatformId): PluginCredentials {
  const creds: PluginCredentials = {};
  for (const camelKey of CREDENTIAL_KEYS[platform]) {
    const value = process.env[envKey(platform, camelKey)];
    if (value) creds[camelKey] = value;
  }
  return creds;
}

/** 모든 플랫폼의 자격 증명 맵을 만든다 (값이 없는 플랫폼은 제외). */
export function loadAllCredentials(): Partial<
  Record<PlatformId, PluginCredentials>
> {
  const out: Partial<Record<PlatformId, PluginCredentials>> = {};
  for (const platform of Object.keys(CREDENTIAL_KEYS) as PlatformId[]) {
    const creds = loadCredentials(platform);
    if (Object.keys(creds).length > 0) out[platform] = creds;
  }
  return out;
}

/** 드라이런 여부 (실제 발행 없이 시뮬레이션). 기본값 true로 안전하게. */
export function isDryRun(): boolean {
  const v = process.env.PSLAB_DRY_RUN;
  if (v === undefined) return true;
  return v !== 'false' && v !== '0';
}
