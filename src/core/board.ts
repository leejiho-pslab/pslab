/**
 * 관제실 상황판 (설계도 무인 운영 3대 장치 中 ③)
 *
 * 각 클라이언트의 격리 저장소에 쌓인 사이클 이력을 모아,
 * "지금 어떻게 돌고 있는지"를 한눈에 보여 준다.
 *  - 마지막 발행은 언제, 무슨 주제였나
 *  - 발행 성공률 / 평균 참여율 추세 (상승/하락)
 *  - 사람 승인 대기(manual) 가 쌓여 있나
 *
 * 데이터는 ClientStore(파일)에서 읽으므로, 데몬과 별개 프로세스에서도
 * 현재 상태를 조회할 수 있다.
 */
import type { ClientConfig, ClientStore } from './client.js';
import type { CycleRecord } from './orchestrator.js';

export interface ClientBoardRow {
  clientId: string;
  name: string;
  reviewMode: string;
  /** 총 사이클 수 */
  cycles: number;
  /** 발행된 사이클 수 */
  published: number;
  /** 발행률 0~1 */
  publishRate: number;
  /** 최근 사이클의 주제 */
  lastTopic?: string;
  /** 최근 사이클 시각 */
  lastAt?: string;
  /** 최근 평균 참여율 0~1 */
  lastEngagement: number;
  /** 참여율 추세 */
  trend: 'up' | 'down' | 'flat' | 'n/a';
  /** 사람 승인 대기 건수 (manual에서 발행 안 된 채 남은 것) */
  pendingApprovals: number;
}

export interface Board {
  generatedAt: string;
  rows: ClientBoardRow[];
  totals: {
    clients: number;
    cycles: number;
    published: number;
    pendingApprovals: number;
  };
}

/**
 * 상황판 생성기.
 *
 * 클라이언트 설정 목록 + 격리 저장소를 받아, 현재 상태 보드를 만든다.
 */
export class StatusBoard {
  constructor(private readonly store: ClientStore<CycleRecord>) {}

  build(clients: ClientConfig[]): Board {
    const rows = clients.map((c) => this.rowFor(c));
    return {
      generatedAt: new Date().toISOString(),
      rows,
      totals: {
        clients: rows.length,
        cycles: sum(rows.map((r) => r.cycles)),
        published: sum(rows.map((r) => r.published)),
        pendingApprovals: sum(rows.map((r) => r.pendingApprovals)),
      },
    };
  }

  private rowFor(client: ClientConfig): ClientBoardRow {
    const history = this.store.read(client.id);
    const published = history.filter((h) => h.published).length;
    const pendingApprovals = history.filter(
      (h) => !h.published && h.review?.pending,
    ).length;
    const last = history.at(-1);

    return {
      clientId: client.id,
      name: client.name,
      reviewMode: client.reviewMode,
      cycles: history.length,
      published,
      publishRate: history.length > 0 ? published / history.length : 0,
      lastTopic: last?.topic,
      lastAt: last?.finishedAt,
      lastEngagement: last?.avgEngagementRate ?? 0,
      trend: this.trendOf(history),
      pendingApprovals,
    };
  }

  /** 발행된 사이클들의 참여율 추세 (마지막 vs 직전 발행). */
  private trendOf(history: CycleRecord[]): ClientBoardRow['trend'] {
    const published = history.filter((h) => h.published);
    if (published.length < 2) return 'n/a';
    const last = published.at(-1)!.avgEngagementRate;
    const prev = published.at(-2)!.avgEngagementRate;
    if (Math.abs(last - prev) < 1e-6) return 'flat';
    return last > prev ? 'up' : 'down';
  }

  /** 보드를 사람이 읽기 좋은 표 문자열로 만든다. */
  static format(board: Board): string {
    const icon = { up: '📈', down: '📉', flat: '➡️', 'n/a': '·' };
    const lines: string[] = [];
    lines.push(`🖥️  pslab 관제실 상황판 (${board.generatedAt})`);
    lines.push('═'.repeat(72));
    lines.push(
      pad('클라이언트', 22) +
        pad('검수', 8) +
        pad('사이클', 8) +
        pad('발행률', 9) +
        pad('참여율', 9) +
        '최근 주제',
    );
    lines.push('─'.repeat(72));
    for (const r of board.rows) {
      lines.push(
        pad(trunc(r.name, 20), 22) +
          pad(r.reviewMode, 8) +
          pad(String(r.cycles), 8) +
          pad(`${(r.publishRate * 100).toFixed(0)}%`, 9) +
          pad(`${(r.lastEngagement * 100).toFixed(1)}% ${icon[r.trend]}`, 9) +
          (r.lastTopic ?? '-'),
      );
      if (r.pendingApprovals > 0) {
        lines.push(`  └ ⏳ 사람 승인 대기 ${r.pendingApprovals}건`);
      }
    }
    lines.push('═'.repeat(72));
    const t = board.totals;
    lines.push(
      `합계: 클라이언트 ${t.clients} · 사이클 ${t.cycles} · 발행 ${t.published}` +
        (t.pendingApprovals > 0 ? ` · ⏳ 승인 대기 ${t.pendingApprovals}` : ''),
    );
    return lines.join('\n');
  }
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

function pad(s: string, width: number): string {
  // 한글 폭 보정: 한글/전각 문자는 2칸으로 계산
  const w = displayWidth(s);
  return w >= width ? s + ' ' : s + ' '.repeat(width - w);
}

function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
  return w;
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
