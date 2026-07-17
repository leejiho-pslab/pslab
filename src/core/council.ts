/**
 * 학습실 / AI 작전회의실 (설계도 6번 작업소)
 *
 * 성적표를 단순히 기록하지 않는다. 역할이 다른 여러 어드바이저(AI)가
 * 한 테이블에 모여, 성과 + 경쟁사 비교 + 디자인을 놓고 토론한 뒤
 * "다음엔 이렇게 가자"는 방향(Direction)을 합의한다.
 *
 * 이 Direction은 다음 사이클의 시장 조사·제작으로 흘러가(강화 신호)
 * 콘텐츠가 스스로 디벨롭되게 만든다.
 *
 * 기본 어드바이저는 규칙 기반이며, 실제 LLM 토론을 붙이려면
 * Advisor 인터페이스를 구현해 주입하면 된다.
 */
import type { AggregatedReport } from './analytics.js';
import type { ResearchResult } from './research.js';
import { createLogger } from './logger.js';

const log = createLogger('council');

export interface CouncilContext {
  /** 이번 사이클 성과 */
  report: AggregatedReport;
  /** 이번 사이클 시장 조사 결과 (경쟁사 비교 포함) */
  research: ResearchResult;
  /** 직전까지의 성과 추세 (있으면 추세 판단에 사용) */
  history?: Array<{ avgEngagementRate: number; topic?: string }>;
}

export interface Advice {
  role: string;
  observation: string;
  recommendation: string;
}

/** 다음 사이클로 넘길 방향성 */
export interface Direction {
  /** 다음에 더 밀 형식들 */
  focusFormats: string[];
  /** 다음에 더 밀 주제들 */
  focusTopics: string[];
  /** 디자인 관련 메모 */
  designNotes: string[];
  /** 합의 근거 요약 */
  rationale: string;
  /** 각 어드바이저 발언 (성적표에 첨부해 사람이 흐름을 볼 수 있게) */
  advices: Advice[];
}

export interface Advisor {
  readonly role: string;
  advise(ctx: CouncilContext): Advice;
}

/** 분석 담당: 어떤 채널/지표가 좋고 나쁜지 본다. */
class AnalystAdvisor implements Advisor {
  readonly role = '분석';
  advise(ctx: CouncilContext): Advice {
    const { reports, totals } = ctx.report;
    const best = [...reports].sort(
      (a, b) =>
        (b.metrics.engagementRate ?? 0) - (a.metrics.engagementRate ?? 0),
    )[0];
    const er = (totals.avgEngagementRate * 100).toFixed(1);
    if (!best) {
      return {
        role: this.role,
        observation: '수집된 성과 데이터가 없습니다.',
        recommendation: '발행량을 늘려 데이터를 모으자.',
      };
    }
    const prev = ctx.history?.at(-1)?.avgEngagementRate;
    const trend =
      prev === undefined
        ? ''
        : totals.avgEngagementRate >= prev
          ? ' (지난 사이클 대비 상승↑)'
          : ' (지난 사이클 대비 하락↓)';
    return {
      role: this.role,
      observation: `평균 참여율 ${er}%${trend}. 최고 채널은 ${best.platform}.`,
      recommendation: `${best.platform} 비중을 늘리자.`,
    };
  }
}

/** 경쟁사 담당: 벤치마킹에서 우리가 놓친 형식/주제를 본다. */
class CompetitorAdvisor implements Advisor {
  readonly role = '경쟁사';
  advise(ctx: CouncilContext): Advice {
    const benches = ctx.research.benchmarks;
    if (benches.length === 0) {
      return {
        role: this.role,
        observation: '모니터링 중인 경쟁사가 없습니다.',
        recommendation: '벤치마킹 대상을 설정표에 추가하자.',
      };
    }
    const top = [...benches].sort(
      (a, b) => b.engagementRate - a.engagementRate,
    )[0];
    return {
      role: this.role,
      observation: `경쟁사 '${top.competitor}'가 ${top.topFormat}(주제:${top.topTopic})로 참여율 ${(top.engagementRate * 100).toFixed(1)}% 기록.`,
      recommendation: `우리도 ${top.topFormat} 형식을 시험하자.`,
    };
  }
}

/** 디자인 담당: 형식/썸네일 관점의 개선점을 본다. */
class DesignerAdvisor implements Advisor {
  readonly role = '디자인';
  advise(ctx: CouncilContext): Advice {
    const topCandidate = ctx.research.topicCandidates[0];
    const format = topCandidate?.suggestedFormat ?? '카드뉴스';
    return {
      role: this.role,
      observation: `상위 소재 후보의 추천 형식은 '${format}'.`,
      recommendation:
        format.includes('영상')
          ? '썸네일 대비를 높이고 첫 3초 훅을 강화하자.'
          : '핵심 메시지를 첫 이미지에 크게 배치하자.',
    };
  }
}

/**
 * 회의 진행자(전략 담당).
 * 다른 어드바이저 발언을 종합해 최종 방향을 합의한다.
 */
export class Council {
  private readonly advisors: Advisor[];

  constructor(advisors?: Advisor[]) {
    this.advisors = advisors ?? [
      new AnalystAdvisor(),
      new CompetitorAdvisor(),
      new DesignerAdvisor(),
    ];
  }

  deliberate(ctx: CouncilContext): Direction {
    log.info(`AI 회의 시작 — 어드바이저 ${this.advisors.length}명`);
    const advices = this.advisors.map((a) => a.advise(ctx));

    // 형식: 경쟁사 상위 형식 + 소재 후보 추천 형식
    const focusFormats = unique([
      ...ctx.research.benchmarks
        .slice()
        .sort((a, b) => b.engagementRate - a.engagementRate)
        .slice(0, 2)
        .map((b) => b.topFormat),
      ...ctx.research.topicCandidates.slice(0, 2).map((c) => c.suggestedFormat),
    ]);

    // 주제: 점수 상위 소재 후보
    const focusTopics = ctx.research.topicCandidates
      .slice(0, 3)
      .map((c) => c.topic);

    const designNotes = advices
      .filter((a) => a.role === '디자인')
      .map((a) => a.recommendation);

    const rationale =
      `다음 사이클은 [${focusTopics.join(', ') || '추가 데이터 필요'}] 주제를 ` +
      `[${focusFormats.join(', ') || '기본'}] 형식으로 강화. ` +
      advices.map((a) => `${a.role}: ${a.recommendation}`).join(' / ');

    return { focusFormats, focusTopics, designNotes, rationale, advices };
  }

  /** 회의 결과를 사람이 읽기 좋은 형태로 (성적표 첨부용). */
  static format(d: Direction): string {
    const lines: string[] = [];
    lines.push('🧠 AI 작전회의 결과');
    lines.push('─'.repeat(50));
    for (const a of d.advices) {
      lines.push(`[${a.role}] ${a.observation}`);
      lines.push(`   → ${a.recommendation}`);
    }
    lines.push('─'.repeat(50));
    lines.push(`다음 방향: ${d.rationale}`);
    return lines.join('\n');
  }
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
