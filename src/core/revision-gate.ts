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

/**
 * 열려 있는 수정요청 이슈 목록 조회.
 * 실패(네트워크·레이트리밋) 시 null — 호출부는 게이트 없이 진행하되 경고를 남긴다
 * (조회 실패로 발행 전체가 영구 정지되는 사태 방지).
 */
export async function fetchOpenRevisionRequests(
  repo: string,
  token?: string,
): Promise<RevisionRequest[] | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues?state=open&per_page=100`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'pslab-sns',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      title?: string;
      body?: string;
      html_url?: string;
      number?: number;
      pull_request?: unknown;
    }>;
    if (!Array.isArray(arr)) return null;
    const out: RevisionRequest[] = [];
    for (const x of arr) {
      if (x.pull_request) continue;
      const m = TITLE_RE.exec(x.title ?? '');
      if (!m) continue;
      const idm = ID_RE.exec(x.body ?? '');
      const cm = CLIENT_RE.exec(x.body ?? '');
      out.push({
        chKey: m[1],
        planId: idm ? idm[1] : null,
        clientId: cm ? cm[1] : null,
        title: x.title ?? '',
        url: x.html_url ?? '',
        number: x.number ?? 0,
      });
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
