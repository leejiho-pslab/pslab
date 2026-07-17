/**
 * 주간 종합 평가 리포트 (대시보드 업그레이드 기능 ④)
 *
 * 매주 월요일, 지난 7일간 발행된 콘텐츠의 성과를 채널별로 집계해
 *  - 최고/최저 성과 글
 *  - 채널별 요약
 *  - 총평 + 다음 주 방향(추천)
 * 을 리포트로 만든다. AI(대표 톤) 우선, 없으면 규칙 기반.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import type { ContentPlan, PlanItem } from './plan.js';
import type { LearningSummary } from './learning.js';
import type { ClientConfig } from './client.js';
import { claudeText } from './claude.js';

const CHANNEL_LABEL: Record<string, string> = {
  instagram: '인스타그램',
  threads: '스레드',
  'naver-blog': '네이버 블로그',
  youtube: '유튜브',
  linkedin: '링크드인',
};

export interface WeeklyChannelStat {
  channel: string;
  label: string;
  posts: number;
  avgEngagement: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
}

export interface WeeklyReport {
  weekOf: string; // 그 주 월요일 (YYYY-MM-DD)
  generatedAt: string;
  range: { from: string; to: string };
  postsCount: number;
  channels: WeeklyChannelStat[];
  top?: { id: string; title: string; label: string; engagementRate: number };
  worst?: { id: string; title: string; label: string; engagementRate: number };
  summary: string;
  recommendations: string[];
  pushedAt?: string;
}

function plainHead(it: PlanItem): string {
  return (it.headline ?? it.topic).replace(/<br>/g, ' ').replace(/\*/g, '');
}
function er(it: PlanItem): number {
  return it.metrics?.engagementRate ?? 0;
}

/** now가 속한 주의 월요일 00:00 (로컬). */
export function mondayOf(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // 월=0
  d.setDate(d.getDate() - dow);
  return d;
}

export class WeeklyReportEngine {
  /** 지난 7일(기본) 발행물로 주간 리포트를 만든다. */
  async build(
    client: ClientConfig,
    plan: ContentPlan,
    learning: LearningSummary | undefined,
    now: Date,
  ): Promise<WeeklyReport> {
    const thisMonday = mondayOf(now);
    const from = new Date(thisMonday.getTime() - 7 * 86_400_000); // 지난주 월
    const to = thisMonday;

    const inRange = plan.items.filter((it) => {
      if (it.status !== 'published' || !it.publishedAt) return false;
      const t = new Date(it.publishedAt).getTime();
      return t >= from.getTime() && t < to.getTime();
    });

    // 채널별 집계
    const byCh = new Map<string, PlanItem[]>();
    for (const it of inRange) {
      const k = it.channels[0];
      (byCh.get(k) ?? byCh.set(k, []).get(k)!).push(it);
    }
    const channels: WeeklyChannelStat[] = [];
    for (const [channel, arr] of byCh) {
      const sum = (f: (x: PlanItem) => number) => arr.reduce((a, x) => a + f(x), 0);
      channels.push({
        channel,
        label: CHANNEL_LABEL[channel] ?? channel,
        posts: arr.length,
        avgEngagement: sum(er) / arr.length,
        totalViews: sum((x) => x.metrics?.views ?? 0),
        totalLikes: sum((x) => x.metrics?.likes ?? 0),
        totalComments: sum((x) => x.metrics?.comments ?? 0),
      });
    }
    channels.sort((a, b) => b.avgEngagement - a.avgEngagement);

    const ranked = [...inRange].sort((a, b) => er(b) - er(a));
    const mk = (it?: PlanItem) =>
      it
        ? {
            id: it.id,
            title: plainHead(it),
            label: CHANNEL_LABEL[it.channels[0]] ?? it.channels[0],
            engagementRate: er(it),
          }
        : undefined;

    const base: Omit<WeeklyReport, 'summary' | 'recommendations'> = {
      weekOf: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`,
      generatedAt: now.toISOString(),
      range: { from: from.toISOString(), to: to.toISOString() },
      postsCount: inRange.length,
      channels,
      top: mk(ranked[0]),
      worst: ranked.length > 1 ? mk(ranked[ranked.length - 1]) : undefined,
    };

    const { summary, recommendations } = await this.narrate(client, base, learning);
    return { ...base, summary, recommendations };
  }

  /** 총평 + 추천 (AI 우선, 폴백 규칙). */
  private async narrate(
    client: ClientConfig,
    r: Omit<WeeklyReport, 'summary' | 'recommendations'>,
    learning?: LearningSummary,
  ): Promise<{ summary: string; recommendations: string[] }> {
    if (r.postsCount === 0) {
      return {
        summary: '지난주 발행된 콘텐츠가 없습니다. 이번 주 기획안을 발행 대기열에 올려두세요.',
        recommendations: ['주 3회(월·수·금) 발행 리듬을 회복하세요.'],
      };
    }
    const fallback = this.ruleNarrate(r, learning);

    const channelLines = r.channels
      .map((c) => `- ${c.label}: ${c.posts}건, 평균 참여율 ${(c.avgEngagement * 100).toFixed(1)}%, 조회 ${c.totalViews}, 좋아요 ${c.totalLikes}`)
      .join('\n');
    const system = [
      `당신은 "${client.persona ?? client.name}"입니다. 본인 SNS의 지난주 성과를 직접 점검하는 1인칭 톤으로,`,
      '주간 종합 평가를 한국어로 씁니다. 담백하고 실무적으로, 숫자를 근거로.',
      '출력은 반드시 아래 JSON 형식만: {"summary": "4~6문장 총평", "recommendations": ["다음주 실행 추천 3개"]}',
    ].join('\n');
    const user = [
      `기간: ${r.range.from.slice(0, 10)} ~ ${r.range.to.slice(0, 10)}`,
      `총 발행: ${r.postsCount}건`,
      '채널별:',
      channelLines,
      r.top ? `최고 성과: [${r.top.label}] ${r.top.title} (참여율 ${(r.top.engagementRate * 100).toFixed(1)}%)` : '',
      r.worst ? `최저 성과: [${r.worst.label}] ${r.worst.title} (참여율 ${(r.worst.engagementRate * 100).toFixed(1)}%)` : '',
      learning?.bestVariant ? `학습상 우세 디자인: ${learning.bestVariant}안` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const text = await claudeText({ system, user, maxTokens: 900 });
    if (!text) return fallback;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : text);
      const summary = typeof parsed.summary === 'string' ? parsed.summary : fallback.summary;
      const recommendations = Array.isArray(parsed.recommendations) && parsed.recommendations.length
        ? parsed.recommendations.map((x: unknown) => String(x)).slice(0, 5)
        : fallback.recommendations;
      return { summary, recommendations };
    } catch {
      return fallback;
    }
  }

  private ruleNarrate(
    r: Omit<WeeklyReport, 'summary' | 'recommendations'>,
    learning?: LearningSummary,
  ): { summary: string; recommendations: string[] } {
    const best = r.channels[0];
    const summary =
      `지난주 ${r.postsCount}건 발행. ` +
      (best ? `'${best.label}'가 평균 참여율 ${(best.avgEngagement * 100).toFixed(1)}%로 가장 좋았습니다. ` : '') +
      (r.top ? `최고 성과는 [${r.top.label}] "${r.top.title}"(참여율 ${(r.top.engagementRate * 100).toFixed(1)}%). ` : '') +
      (r.worst ? `반대로 "${r.worst.title}"는 반응이 약했습니다.` : '');
    const recs: string[] = [];
    if (learning?.bestVariant) recs.push(`우세 디자인 ${learning.bestVariant}안을 다음 주 핵심 콘텐츠에 더 배치하세요.`);
    if (r.top) recs.push(`"${r.top.title}" 톤·구성을 변주해 후속편을 만드세요.`);
    if (r.worst) recs.push(`"${r.worst.title}" 유형은 첫 슬라이드 후킹/결론 우선을 강화하세요.`);
    if (!recs.length) recs.push('주 3회 발행 리듬을 유지하며 디자인 A/B를 계속 비교하세요.');
    return { summary, recommendations: recs };
  }
}

/** 클라이언트별 주간 리포트 저장소(최신 우선, 최근 12개 유지). */
export class WeeklyReportStore {
  constructor(private readonly baseDir: string) {}

  private fileFor(clientId: string): string {
    return join(this.baseDir, clientId, 'weekly-reports.json');
  }

  load(clientId: string): WeeklyReport[] {
    const file = this.fileFor(clientId);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as WeeklyReport[];
      } catch {
        /* fallthrough */
      }
    }
    return [];
  }

  latest(clientId: string): WeeklyReport | undefined {
    return this.load(clientId)[0];
  }

  /** 같은 주(weekOf)면 교체, 아니면 앞에 추가. */
  save(clientId: string, report: WeeklyReport): void {
    const list = this.load(clientId).filter((r) => r.weekOf !== report.weekOf);
    list.unshift(report);
    const trimmed = list.slice(0, 12);
    const file = this.fileFor(clientId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(trimmed, null, 2), 'utf8');
  }
}
