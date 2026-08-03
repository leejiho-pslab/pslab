import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * 발행 원장 (append-only) — 중복 발행 방지의 단일 진실원.
 *
 * 왜 plan.json 으로 부족한가:
 *   기존 멱등성은 `item.status === 'published'` 하나에만 걸려 있었다. 그런데 plan.json 은
 *   기획·상태·산출물이 뒤섞인 채 사람과 CI 가 함께 고치는 파일이라 **되돌아갈 수 있다**.
 *   실제 사고 (2026-07-31):
 *     20:42  CI 가 reels/youtube-07-31 을 발행하고 status=published 로 커밋
 *     01:19  세션이 오래된 로컬 plan.json 을 그대로 커밋 → status 가 planned 로 되돌아감
 *     이후    크론이 "예정시각 지났는데 planned" 로 보고 **같은 콘텐츠를 다시 발행**
 *   인스타그램·유튜브에 중복 게시물이 하나씩 더 올라갔다.
 *
 * 그래서 "이미 내보냈다"는 사실만 **별도 append-only 파일**로 분리한다.
 *   · plan.json 이 어떤 이유로 되돌아가도 원장은 남는다
 *   · 병합 충돌이 나도 합집합이 정답이라 해소가 안전하다(양쪽 키를 합치면 된다)
 *   · 기록은 지우지 않는다 — 재발행이 필요하면 운영자가 명시적으로 원장에서 지운다
 */

export type LedgerEntry = {
  /** 최초 발행 시각 (재시도로 덮어쓰지 않는다) */
  firstPublishedAt: string;
  /** 실제로 성공한 채널 */
  channels: string[];
  /** 채널별 원격 식별자 — 나중에 중복분을 찾아 지울 때 필요하다 */
  refs: Array<{ platform: string; remoteId: string; url?: string }>;
};

export type Ledger = Record<string, LedgerEntry>;

const fileFor = (dataDir: string, clientId: string): string =>
  join(dataDir, clientId, 'published-ledger.json');

export function loadLedger(dataDir: string, clientId: string): Ledger {
  const f = fileFor(dataDir, clientId);
  if (!existsSync(f)) return {};
  try {
    const raw = JSON.parse(readFileSync(f, 'utf8')) as unknown;
    return raw && typeof raw === 'object' ? (raw as Ledger) : {};
  } catch {
    // 원장이 깨졌다고 발행을 막으면 운영이 멈춘다. 다만 빈 원장으로 진행하면
    // 중복 위험이 생기므로 크게 경고한다.
    console.warn('⚠️ published-ledger.json 파싱 실패 — 중복 방지가 약해진 상태로 진행합니다');
    return {};
  }
}

export function saveLedger(dataDir: string, clientId: string, ledger: Ledger): void {
  const f = fileFor(dataDir, clientId);
  mkdirSync(dirname(f), { recursive: true });
  // 키 정렬 — 병합 diff 를 읽을 수 있게 유지한다
  const sorted: Ledger = {};
  for (const k of Object.keys(ledger).sort()) sorted[k] = ledger[k];
  writeFileSync(f, JSON.stringify(sorted, null, 2) + '\n');
}

/** 이미 내보낸 항목인가 (plan.json 상태와 무관) */
export const alreadyPublished = (ledger: Ledger, itemId: string): boolean =>
  Boolean(ledger[itemId]);

/**
 * 발행 성공을 기록한다. 이미 있으면 채널·참조만 합치고 최초 시각은 보존한다
 * (한 항목을 여러 채널에 나눠 발행하는 경우가 있어서다).
 */
export function recordPublish(
  ledger: Ledger,
  itemId: string,
  refs: Array<{ platform: string; remoteId: string; url?: string }>,
): Ledger {
  const prev = ledger[itemId];
  const merged = [...(prev?.refs ?? [])];
  for (const r of refs) {
    if (!merged.some((m) => m.platform === r.platform && m.remoteId === r.remoteId)) {
      merged.push(r);
    }
  }
  ledger[itemId] = {
    firstPublishedAt: prev?.firstPublishedAt ?? new Date().toISOString(),
    channels: [...new Set(merged.map((r) => r.platform))],
    refs: merged,
  };
  return ledger;
}
