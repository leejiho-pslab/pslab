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
  detail?: string;
}

export interface TokenHealth {
  checkedAt: string;
  tokens: TokenStatus[];
}

const WARN_DAYS = 7;

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
    const res = await fetch(url);
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
    const res = await fetch(`${apiBase}/me?fields=id&access_token=${encodeURIComponent(token)}`);
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
  ]);
  return {
    checkedAt: new Date().toISOString(),
    tokens: checks.filter((c): c is TokenStatus => c !== undefined),
  };
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
