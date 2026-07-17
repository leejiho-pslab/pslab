import type { PluginRegistry } from './registry.js';
import type {
  AnalyticsReport,
  PlatformId,
  PublishResult,
} from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('analytics');

/** 발행 결과로부터 추적 대상(플랫폼 + remoteId)을 만든다. */
export interface TrackedPost {
  platform: PlatformId;
  remoteId: string;
}

export interface AggregatedReport {
  collectedAt: string;
  reports: AnalyticsReport[];
  totals: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    /** 가중 평균 참여율 */
    avgEngagementRate: number;
  };
}

/**
 * 분석·리포팅 엔진.
 *
 * 발행된 게시물들의 성과를 플러그인에서 수집해 집계 리포트로 만든다.
 */
export class Analytics {
  constructor(private readonly registry: PluginRegistry) {}

  /** 발행 결과 목록을 추적 대상으로 변환한다 (성공한 것만). */
  static fromPublishResults(results: PublishResult[]): TrackedPost[] {
    return results
      .filter((r) => r.ok && r.remoteId)
      .map((r) => ({ platform: r.platform, remoteId: r.remoteId! }));
  }

  /** 추적 대상들의 성과를 병렬 수집해 집계한다. */
  async collect(posts: TrackedPost[]): Promise<AggregatedReport> {
    log.info(`성과 수집 시작 — ${posts.length}건`);
    const settled = await Promise.allSettled(
      posts.map((p) =>
        this.registry.get(p.platform).fetchAnalytics(p.remoteId),
      ),
    );

    const reports: AnalyticsReport[] = [];
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        reports.push(s.value);
      } else {
        log.warn(
          `${posts[i].platform}/${posts[i].remoteId} 수집 실패 — ${
            s.reason instanceof Error ? s.reason.message : String(s.reason)
          }`,
        );
      }
    });

    return {
      collectedAt: new Date().toISOString(),
      reports,
      totals: this.computeTotals(reports),
    };
  }

  private computeTotals(reports: AnalyticsReport[]): AggregatedReport['totals'] {
    let views = 0;
    let likes = 0;
    let comments = 0;
    let shares = 0;
    let erSum = 0;
    let erCount = 0;

    for (const r of reports) {
      views += r.metrics.views ?? 0;
      likes += r.metrics.likes ?? 0;
      comments += r.metrics.comments ?? 0;
      shares += r.metrics.shares ?? 0;
      if (typeof r.metrics.engagementRate === 'number') {
        erSum += r.metrics.engagementRate;
        erCount += 1;
      }
    }

    return {
      views,
      likes,
      comments,
      shares,
      avgEngagementRate: erCount > 0 ? erSum / erCount : 0,
    };
  }

  /** 집계 리포트를 사람이 읽기 좋은 표 형태 문자열로 만든다. */
  static format(report: AggregatedReport): string {
    const lines: string[] = [];
    lines.push(`📊 SNS 성과 리포트 (${report.collectedAt})`);
    lines.push('─'.repeat(60));
    lines.push(
      pad('플랫폼', 12) +
        pad('조회', 10) +
        pad('좋아요', 10) +
        pad('댓글', 8) +
        pad('공유', 8) +
        '참여율',
    );
    for (const r of report.reports) {
      const m = r.metrics;
      lines.push(
        pad(r.platform, 12) +
          pad(String(m.views ?? 0), 10) +
          pad(String(m.likes ?? 0), 10) +
          pad(String(m.comments ?? 0), 8) +
          pad(String(m.shares ?? 0), 8) +
          `${((m.engagementRate ?? 0) * 100).toFixed(1)}%`,
      );
    }
    lines.push('─'.repeat(60));
    const t = report.totals;
    lines.push(
      pad('합계', 12) +
        pad(String(t.views), 10) +
        pad(String(t.likes), 10) +
        pad(String(t.comments), 8) +
        pad(String(t.shares), 8) +
        `${(t.avgEngagementRate * 100).toFixed(1)}%`,
    );
    return lines.join('\n');
  }
}

function pad(s: string, width: number): string {
  return s.length >= width ? s + ' ' : s + ' '.repeat(width - s.length);
}
