/**
 * 발행 전 검수 게이트 — 수정요청 이슈와 자동 발행을 묶는 안전장치.
 *
 * 대시보드 수정요청 게시판은 `[수정요청·<채널key>]` 제목 규약의 깃허브 이슈를 만든다.
 * 이 모듈은 발행 시점(publish-plan --due)에 열려 있는 수정요청을 조회해,
 * 해당 콘텐츠의 발행을 보류시킨다. 수정사항이 반영되고 이슈가 닫히면(처리완료)
 * 다음 사이클에 자동 발행된다.
 *
 * 매칭 규칙 (대시보드 openHolds()와 동일해야 한다):
 *  - 본문에 `(id: <planItemId>)`가 있으면 → 그 콘텐츠만 보류
 *  - id가 없으면(채널 공통 요청) → 그 채널의 발행 전 콘텐츠 전체 보류
 *  - 본문에 `업체: <clientId>`가 있으면 → 그 업체만 (없으면 전 업체 — 과거 이슈 호환)
 */
import type { PlatformId } from './types.js';

export interface RevisionRequest {
  chKey: string;
  planId: string | null;
  /** 업체 스코프 (여러 업체가 한 저장소를 쓸 때) — 없으면 전 업체 적용(과거 이슈 호환) */
  clientId: string | null;
  title: string;
  url: string;
  number: number;
}

const TITLE_RE = /^\[수정요청·([a-z-]+)\]/;
const ID_RE = /\(id:\s*([\w.-]+)\)/;
const CLIENT_RE = /업체:\s*([\w-]+)/;

interface RawIssue {
  title?: string;
  body?: string;
  html_url?: string;
  number?: number;
  pull_request?: unknown;
}

/** 이슈 1건 → 수정요청 파싱. 규약 밖 제목이거나 PR이면 null. */
export function parseRevisionIssue(x: RawIssue): RevisionRequest | null {
  if (x.pull_request) return null;
  const m = TITLE_RE.exec(x.title ?? '');
  if (!m) return null;
  const idm = ID_RE.exec(x.body ?? '');
  const cm = CLIENT_RE.exec(x.body ?? '');
  return {
    chKey: m[1],
    planId: idm ? idm[1] : null,
    clientId: cm ? cm[1] : null,
    title: x.title ?? '',
    url: x.html_url ?? '',
    number: x.number ?? 0,
  };
}

/**
 * 열려 있는 수정요청 이슈 목록 조회 (최대 3페이지 = 300건 — 그 이상 열려 있으면 운영 이상).
 * 실패(네트워크·레이트리밋) 시 null — 호출부는 게이트 없이 진행하되 경고를 남긴다
 * (조회 실패로 발행 전체가 영구 정지되는 사태 방지).
 */
export async function fetchOpenRevisionRequests(
  repo: string,
  token?: string,
): Promise<RevisionRequest[] | null> {
  try {
    const out: RevisionRequest[] = [];
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/issues?state=open&per_page=100&page=${page}`,
        {
          headers: {
            accept: 'application/vnd.github+json',
            'user-agent': 'pslab-sns',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        },
      );
      if (!res.ok) return null;
      const arr = (await res.json()) as RawIssue[];
      if (!Array.isArray(arr)) return null;
      for (const x of arr) {
        const req = parseRevisionIssue(x);
        if (req) out.push(req);
      }
      if (arr.length < 100) break;
    }
    return out;
  } catch {
    return null;
  }
}

/** 이 기획 항목에 걸린 미처리 수정요청 (있으면 발행 보류). */
export function holdsForItem(
  clientId: string,
  item: { id: string; channels: PlatformId[] },
  requests: RevisionRequest[],
): RevisionRequest[] {
  return requests.filter(
    (r) =>
      (!r.clientId || r.clientId === clientId) &&
      (r.planId ? r.planId === item.id : item.channels.includes(r.chKey as PlatformId)),
  );
}

/** 보류 재알림 주기 — 조용히 잊히는 보류 방지 (첫 알림 포함, 72시간마다 1회) */
export const HOLD_RENOTIFY_MS = 72 * 60 * 60 * 1000;

/** 지금 보류 알림을 보내야 하나? (미알림이거나 재알림 주기가 지났으면 true) */
export function shouldNotifyHold(holdNotifiedAt: string | undefined, now: number): boolean {
  if (!holdNotifiedAt) return true;
  const t = new Date(holdNotifiedAt).getTime();
  return !Number.isFinite(t) || now - t > HOLD_RENOTIFY_MS;
}
