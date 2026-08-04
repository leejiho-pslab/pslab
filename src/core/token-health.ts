/**
 * 토큰 건강검진 — 만료 전 경고 (무인 자동화의 핵심 안전장치)
 *
 * SNS 장기 토큰은 60일이면 죽는다. 지금까지는 발행이 실패해야 비로소 알았는데,
 * 이 모듈은 매 실행마다 토큰이 살아있는지(라이브 핑) 확인하고,
 * 앱 자격(app id/secret)이 있으면 debug_token으로 "만료까지 며칠 남았는지"까지
 * 계산해, 만료 7일 전에 대시보드에 경고를 띄운다.
 *
 * 환경변수:
 *   PSLAB_INSTAGRAM_ACCESS_TOKEN  / PSLAB_FB_APP_ID, PSLAB_FB_APP_SECRET(선택)
 *   PSLAB_THREADS_ACCESS_TOKEN    / PSLAB_THREADS_APP_ID, PSLAB_THREADS_APP_SECRET(선택)
 */
import { timedFetch } from '../plugins/shared.js';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

export interface TokenStatus {
  label: string;
  platform: string;
  /** 라이브 핑 성공 여부 */
  ok: boolean;
  /** 만료 임박 등 주의 필요 */
  warn: boolean;
  /** 만료까지 남은 일수 (앱 자격이 있을 때만) */
  expiresInDays?: number;
  /** 이 토큰이 "살아있음"으로 처음 확인된 시각 — 구글 7일 만료 카운트다운의 기준 */
  okSince?: string;
  /** okSince 이후 지난 일수 */
  aliveDays?: number;
  detail?: string;
}

export interface TokenHealth {
  checkedAt: string;
  tokens: TokenStatus[];
}

const WARN_DAYS = 7;

/**
 * 구글 OAuth 앱이 "테스트 중" 상태면 refresh token 이 **발급 7일 뒤 자동 폐기**된다.
 * 죽고 나서 invalid_grant 를 잡아봐야 이미 발행이 한 번 실패한 뒤다 —
 * 실제로 2026-07-27 에 유튜브가 그렇게 죽었고, 재발급 후 정확히 7일 뒤 또 만료 통지가 왔다.
 * 그래서 "살아있은 지 며칠 됐는지"를 세어 만료 하루 전에 미리 경고한다.
 * (근본 해결은 OAuth 동의 화면 게시 상태를 "프로덕션"으로 바꾸는 것 — 그러면 7일 만료가 없어진다.)
 */
const GOOGLE_TESTING_TTL_DAYS = 7;
const GOOGLE_WARN_AT_DAYS = 6;

/** 만료까지 남은 일수를 debug_token으로 조회 (실패 시 undefined). */
async function expiresInDays(
  apiBase: string,
  token: string,
  appId?: string,
  appSecret?: string,
): Promise<number | undefined> {
  if (!appId || !appSecret) return undefined;
  try {
    const url = `${apiBase}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${appId}|${appSecret}`;
    const res = await timedFetch(url);
    const json: any = await res.json().catch(() => ({}));
    const expiresAt = json?.data?.expires_at;
    if (typeof expiresAt !== 'number' || expiresAt === 0) return undefined; // 0 = 무기한
    const days = Math.floor((expiresAt * 1000 - Date.now()) / 86_400_000);
    return days;
  } catch {
    return undefined;
  }
}

/** 토큰으로 /me 를 호출해 살아있는지 확인한다. */
async function liveCheck(
  apiBase: string,
  token: string,
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res = await timedFetch(`${apiBase}/me?fields=id&access_token=${encodeURIComponent(token)}`);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      return { ok: false, detail: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function checkOne(
  label: string,
  platform: string,
  apiBase: string,
  token: string | undefined,
  appId?: string,
  appSecret?: string,
): Promise<TokenStatus | undefined> {
  if (!token) return undefined; // 미설정 채널은 건너뜀
  const live = await liveCheck(apiBase, token);
  const days = live.ok ? await expiresInDays(apiBase, token, appId, appSecret) : undefined;
  const warn =
    !live.ok || (typeof days === 'number' && days <= WARN_DAYS);
  let detail = live.detail;
  if (live.ok && typeof days === 'number' && days <= WARN_DAYS) {
    detail = `⚠️ ${days}일 후 만료 — 토큰을 새로 발급해 시크릿을 갱신하세요.`;
  } else if (!live.ok) {
    detail = `토큰 오류(만료 가능): ${detail ?? ''} — 새로 발급해 시크릿을 갱신하세요.`;
  }
  return { label, platform, ok: live.ok, warn, expiresInDays: days, detail };
}

/**
 * 구글 OAuth refresh token이 살아있는지 실제 토큰 교환으로 확인한다.
 * (유튜브·블로거 공용. 발행 시점이 아니라 매 점검마다 미리 확인 — 특히
 * 미검수 앱의 유튜브 refresh token은 7일마다 만료되므로 조기 경보가 필수.)
 */
async function googleRefreshCheck(
  label: string,
  platform: string,
  clientId?: string,
  clientSecret?: string,
  refreshToken?: string,
): Promise<TokenStatus | undefined> {
  if (!clientId || !clientSecret || !refreshToken) return undefined;
  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await timedFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json.access_token) {
      return { label, platform, ok: true, warn: false };
    }
    const code = json.error ?? `HTTP ${res.status}`;
    const hint =
      json.error === 'invalid_grant'
        ? 'refresh token 만료/폐기 — OAuth Playground에서 재발급해 시크릿을 교체하세요 (미검수 앱은 7일마다 만료).'
        : (json.error_description ?? '자격 증명을 확인하세요.');
    return { label, platform, ok: false, warn: true, detail: `토큰 오류(${code}): ${hint}` };
  } catch (err) {
    return {
      label,
      platform,
      ok: false,
      warn: true,
      detail: `점검 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * LinkedIn 접근 토큰 생존 확인. 401만 확실한 만료로 취급한다
 * (403은 스코프 제한일 수 있어 살아있다고 본다 — 오탐 경고 방지).
 */
async function linkedinCheck(token?: string): Promise<TokenStatus | undefined> {
  if (!token) return undefined;
  const base = { label: 'LinkedIn', platform: 'linkedin' };
  try {
    const res = await timedFetch('https://api.linkedin.com/v2/userinfo', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return {
        ...base,
        ok: false,
        warn: true,
        detail: '토큰 만료/무효 — 개발자 포털에서 접근 토큰을 재발급해 시크릿을 교체하세요 (약 60일 주기).',
      };
    }
    return { ...base, ok: true, warn: false };
  } catch (err) {
    return {
      ...base,
      ok: false,
      warn: true,
      detail: `점검 실패: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** 환경변수의 SNS 토큰들을 점검한다. */
export async function checkTokens(): Promise<TokenHealth> {
  const env = process.env;
  const checks = await Promise.all([
    checkOne(
      'Instagram',
      'instagram',
      'https://graph.facebook.com/v21.0',
      env.PSLAB_INSTAGRAM_ACCESS_TOKEN,
      env.PSLAB_FB_APP_ID,
      env.PSLAB_FB_APP_SECRET,
    ),
    checkOne(
      'Threads',
      'threads',
      'https://graph.threads.net/v1.0',
      env.PSLAB_THREADS_ACCESS_TOKEN,
      env.PSLAB_THREADS_APP_ID,
      env.PSLAB_THREADS_APP_SECRET,
    ),
    googleRefreshCheck(
      'YouTube',
      'youtube',
      env.PSLAB_YOUTUBE_CLIENT_ID,
      env.PSLAB_YOUTUBE_CLIENT_SECRET,
      env.PSLAB_YOUTUBE_REFRESH_TOKEN,
    ),
    googleRefreshCheck(
      'Blogger',
      'blogger',
      env.PSLAB_BLOGGER_CLIENT_ID,
      env.PSLAB_BLOGGER_CLIENT_SECRET,
      env.PSLAB_BLOGGER_REFRESH_TOKEN,
    ),
    linkedinCheck(env.PSLAB_LINKEDIN_ACCESS_TOKEN),
  ]);
  return {
    checkedAt: new Date().toISOString(),
    tokens: checks.filter((c): c is TokenStatus => c !== undefined),
  };
}

/**
 * 구글 토큰의 "살아있은 지 며칠" 카운트다운을 직전 점검 결과와 합쳐 채운다.
 *
 * 죽은 뒤에 알려주는 경고는 늦다. 토큰이 처음 살아난 시각(okSince)을 이어 들고 가면서
 * 6일째부터 미리 경고한다. 토큰이 한 번 죽었다 살아나면 okSince 를 새로 잡는다(재발급 시점).
 */
export function withGoogleCountdown(
  fresh: TokenHealth,
  prev: TokenHealth | undefined,
): TokenHealth {
  const now = Date.parse(fresh.checkedAt);
  const tokens = fresh.tokens.map((t) => {
    if (t.platform !== 'youtube' && t.platform !== 'blogger') return t;
    if (!t.ok) return t; // 이미 죽었으면 기존 detail(invalid_grant 안내)이 더 정확하다
    const before = prev?.tokens.find((p) => p.platform === t.platform);
    // 직전에도 살아 있었으면 그때의 okSince 를 이어받고, 아니면 지금이 재발급 시점이다.
    const okSince = before?.ok && before.okSince ? before.okSince : fresh.checkedAt;
    const aliveDays = Math.floor((now - Date.parse(okSince)) / 86_400_000);
    if (aliveDays < GOOGLE_WARN_AT_DAYS) return { ...t, okSince, aliveDays };
    const left = GOOGLE_TESTING_TTL_DAYS - aliveDays;
    return {
      ...t,
      okSince,
      aliveDays,
      warn: true,
      detail:
        `⚠️ 발급 ${aliveDays}일째 — OAuth 앱이 "테스트 중"이면 7일에 폐기됩니다` +
        `(${left <= 0 ? '오늘 만료 가능' : `약 ${left}일 남음`}). ` +
        `근본 해결: 구글 클라우드 콘솔 → OAuth 동의 화면 → 게시 상태를 "프로덕션"으로 변경. ` +
        `임시 조치: OAuth Playground 에서 refresh token 재발급 후 시크릿 교체.`,
    };
  });
  return { ...fresh, tokens };
}

/** 클라이언트별 토큰 건강 상태 저장소. data/<clientId>/token-health.json */
export class TokenHealthStore {
  constructor(private readonly baseDir: string) {}

  private fileFor(clientId: string): string {
    return join(this.baseDir, clientId, 'token-health.json');
  }

  load(clientId: string): TokenHealth | undefined {
    const file = this.fileFor(clientId);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as TokenHealth;
      } catch {
        /* fallthrough */
      }
    }
    return undefined;
  }

  save(clientId: string, health: TokenHealth): void {
    const file = this.fileFor(clientId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(health, null, 2), 'utf8');
  }
}
