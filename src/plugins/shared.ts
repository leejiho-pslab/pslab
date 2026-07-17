import type { AnalyticsMetrics } from '../core/types.js';

/**
 * 실제 HTTP 호출 자리를 표시하는 시뮬레이션 헬퍼.
 *
 * dryRun=true 이거나 실제 SDK 연동 전 단계에서, 네트워크 지연을 흉내 내고
 * 결정론에 가까운 가짜 응답을 만들어 파이프라인 전체를 검증할 수 있게 한다.
 * 실제 연동 시 이 함수를 각 플랫폼 API 호출로 교체하면 된다.
 */
export async function simulateApiCall<T>(value: T, ms = 50): Promise<T> {
  await new Promise((r) => setTimeout(r, ms));
  return value;
}

/** remoteId 문자열을 시드로 한 의사난수 지표 생성 (리포팅 데모용) */
export function pseudoMetrics(seed: string): AnalyticsMetrics {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const rand = (n: number) => h % n;
  const views = 500 + rand(50_000);
  const likes = Math.floor(views * (0.02 + (rand(80) / 1000)));
  const comments = Math.floor(likes * (0.05 + rand(20) / 100));
  const shares = Math.floor(likes * (0.03 + rand(15) / 100));
  const engagementRate = (likes + comments + shares) / views;
  return { views, likes, comments, shares, engagementRate };
}

/**
 * 타임아웃 있는 fetch — 무인 크론에서 응답 없는 연결이 잡 전체를 몇십 분씩
 * 묶어두는 사고 방지(2026-07-09 autopilot 15분 행 후 취소 사례).
 * 기본 60초, 대용량 업로드는 호출부에서 늘려서 사용.
 */
export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error(`요청 시간 초과(${Math.round(timeoutMs / 1000)}s): ${url.slice(0, 80)}`)), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}
