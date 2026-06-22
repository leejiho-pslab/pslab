/**
 * 품질 검사대 / 검수 스위치 (설계도 3번 작업소)
 *
 * 발행 직전 게시물을 검사한다. 핵심은 "스위치":
 *  - 'manual' : 사람이 직접 승인해야 통과 (초기, 신뢰 쌓기)
 *  - 'rules'  : 규칙(금지어·길이 등) 자동 검사 후 통과/보류 (반자동)
 *  - 'auto'   : 무조건 통과 (100% 자동)
 *
 * 클라이언트별로 이 스위치를 따로 둘 수 있어, 신뢰가 쌓인 곳부터
 * 'manual' → 'rules' → 'auto' 로 단계적으로 전환한다.
 */
import type { PostContent } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('review');

export type ReviewMode = 'manual' | 'rules' | 'auto';

export interface ReviewPolicy {
  mode: ReviewMode;
  /** 포함 시 보류시키는 금지어 */
  bannedWords?: string[];
  /** 본문 최소 길이 */
  minBodyLength?: number;
  /** 본문 최대 길이 (전 채널 공통 상한; 채널별 세부 검증은 플러그인이 담당) */
  maxBodyLength?: number;
}

export interface ReviewDecision {
  /** 발행 진행 가능 여부 */
  approved: boolean;
  /** 사람 승인 대기 상태인지 (manual 모드) */
  pending: boolean;
  reviewer: 'auto' | 'rules' | 'human';
  reason: string;
  /** 걸린 문제들 (있어도 mode에 따라 통과될 수 있음) */
  flags: string[];
}

/**
 * 검수 게이트.
 *
 * review()는 규칙 검사를 수행하고 모드에 따라 결정을 내린다.
 * 'manual' 모드에서 규칙을 통과하면 pending=true(사람 승인 대기)로 두고,
 * approveManually()로 사람이 최종 승인한다.
 */
export class ReviewGate {
  constructor(private policy: ReviewPolicy) {}

  /** 런타임에 스위치를 바꾼다 (예: 신뢰가 쌓여 auto로 전환). */
  setMode(mode: ReviewMode): void {
    log.info(`검수 스위치 변경: ${this.policy.mode} → ${mode}`);
    this.policy = { ...this.policy, mode };
  }

  get mode(): ReviewMode {
    return this.policy.mode;
  }

  /** 규칙 위반 목록을 만든다 (모드와 무관한 순수 검사). */
  private inspect(content: PostContent): string[] {
    const flags: string[] = [];
    const body = content.body ?? '';
    const haystack = `${content.title ?? ''}\n${body}\n${(content.tags ?? []).join(' ')}`.toLowerCase();

    for (const word of this.policy.bannedWords ?? []) {
      if (word && haystack.includes(word.toLowerCase())) {
        flags.push(`금지어 포함: "${word}"`);
      }
    }
    if (
      this.policy.minBodyLength !== undefined &&
      body.trim().length < this.policy.minBodyLength
    ) {
      flags.push(
        `본문이 너무 짧음 (${body.trim().length} < ${this.policy.minBodyLength})`,
      );
    }
    if (
      this.policy.maxBodyLength !== undefined &&
      body.length > this.policy.maxBodyLength
    ) {
      flags.push(
        `본문이 너무 김 (${body.length} > ${this.policy.maxBodyLength})`,
      );
    }
    return flags;
  }

  review(content: PostContent): ReviewDecision {
    const flags = this.inspect(content);
    const mode = this.policy.mode;

    // 규칙 위반이 있으면 어떤 모드든 통과시키지 않는다 (auto도 안전장치 유지).
    if (flags.length > 0) {
      return {
        approved: false,
        pending: mode === 'manual',
        reviewer: mode === 'manual' ? 'human' : 'rules',
        reason: `규칙 위반 ${flags.length}건`,
        flags,
      };
    }

    if (mode === 'auto') {
      return {
        approved: true,
        pending: false,
        reviewer: 'auto',
        reason: '자동 통과 (검수 스위치 OFF)',
        flags,
      };
    }
    if (mode === 'rules') {
      return {
        approved: true,
        pending: false,
        reviewer: 'rules',
        reason: '규칙 검사 통과',
        flags,
      };
    }
    // manual: 규칙은 통과했지만 사람 승인 대기
    return {
      approved: false,
      pending: true,
      reviewer: 'human',
      reason: '사람 승인 대기',
      flags,
    };
  }

  /** manual 모드에서 사람이 최종 승인/반려한다. */
  approveManually(content: PostContent, approve: boolean): ReviewDecision {
    const flags = this.inspect(content);
    if (approve && flags.length === 0) {
      return {
        approved: true,
        pending: false,
        reviewer: 'human',
        reason: '사람 승인 완료',
        flags,
      };
    }
    return {
      approved: false,
      pending: false,
      reviewer: 'human',
      reason: approve ? `규칙 위반으로 승인 불가 (${flags.length}건)` : '사람 반려',
      flags,
    };
  }
}
