/**
 * 자체 학습 엔진 (self-developing loop) — 설계도 "반응도로 스스로 발전"
 *
 * 발행된 게시물의 실제 성과(좋아요·조회·참여율)를 모아
 *  - 디자인 변형(A/B/C) 중 무엇이 잘 먹혔는지
 *  - 어떤 채널·시간대·모티프(주제 그래픽)가 반응이 좋은지
 * 를 집계해 LearningSummary로 만든다.
 *
 * 이 요약은 (1) 대시보드의 "성과 인사이트" 패널에 노출되고,
 * (2) 다음 기획 생성(generate.ts)의 변형 선택·프롬프트 힌트로 되먹임되어
 * 콘텐츠가 발행될수록 디자인·내용·반응도가 스스로 좋아지게 한다.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import type { ContentPlan, PlanItem } from './plan.js';
import type { PlatformId } from './types.js';

/** 한 그룹(변형/채널/시간대 등)의 성과 집계 */
export interface GroupStat {
  key: string;
  posts: number;
  avgEngagement: number;
  avgLikes: number;
  avgViews: number;
}

export interface LearningSummary {
  generatedAt: string;
  /** 성과가 수집된 발행 게시물 수 */
  sampleSize: number;
  /** 디자인 변형별 성과 (A/B/C) */
  variants: GroupStat[];
  /** 채널별 성과 */
  channels: GroupStat[];
  /** 발행 시간대(시)별 성과 */
  hours: GroupStat[];
  /** 주제 그래픽(모티프)별 성과 */
  motifs: GroupStat[];
  /** 가장 잘 먹힌 디자인 변형 (없으면 undefined) */
  bestVariant?: string;
  /** 가장 반응 좋은 발행 시각(HH:00) */
  bestHour?: string;
  /** 다음 기획에 줄 한국어 힌트 (프롬프트·대시보드 공용) */
  hints: string[];
}

function engagement(it: PlanItem): number {
  const m = it.metrics;
  if (!m) return 0;
  if (typeof m.engagementRate === 'number' && m.engagementRate > 0) {
    return m.engagementRate;
  }
  // 참여율이 없으면 좋아요+댓글을 대용 지표로
  return (m.likes ?? 0) + (m.comments ?? 0);
}

/** 키별로 묶어 평균 성과를 낸다 (성과 큰 순 정렬). */
function groupBy(
  items: PlanItem[],
  keyOf: (it: PlanItem) => string | undefined,
): GroupStat[] {
  const buckets = new Map<string, PlanItem[]>();
  for (const it of items) {
    const k = keyOf(it);
    if (!k) continue;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(it);
  }
  const stats: GroupStat[] = [];
  for (const [key, arr] of buckets) {
    const n = arr.length;
    const sum = (f: (it: PlanItem) => number) =>
      arr.reduce((a, it) => a + f(it), 0);
    stats.push({
      key,
      posts: n,
      avgEngagement: sum(engagement) / n,
      avgLikes: sum((it) => it.metrics?.likes ?? 0) / n,
      avgViews: sum((it) => it.metrics?.views ?? 0) / n,
    });
  }
  return stats.sort((a, b) => b.avgEngagement - a.avgEngagement);
}

export class LearningEngine {
  /** 발행+성과 수집이 끝난 항목들로 학습 요약을 만든다. */
  summarize(plan: ContentPlan): LearningSummary {
    // 성과가 실제로 수집된(metrics 존재) 발행 항목만 학습 대상
    const measured = plan.items.filter(
      (it) => it.status === 'published' && it.metrics,
    );

    const variants = groupBy(measured, (it) => it.variant);
    const channels = groupBy(measured, (it) => it.channels[0]);
    const hours = groupBy(measured, (it) =>
      it.publishedAt
        ? `${String(new Date(it.publishedAt).getHours()).padStart(2, '0')}:00`
        : undefined,
    );
    const motifs = groupBy(measured, (it) => it.motif);

    const bestVariant = variants.length >= 2 ? variants[0].key : undefined;
    const bestHour = hours.length >= 2 ? hours[0].key : undefined;

    const hints: string[] = [];
    if (measured.length < 3) {
      hints.push(
        `아직 성과 표본이 ${measured.length}건뿐 — 더 쌓이면 디자인·시간대 학습이 정교해집니다.`,
      );
    }
    if (bestVariant) {
      const top = variants[0];
      hints.push(
        `디자인 ${bestVariant}안이 평균 참여율 ${(top.avgEngagement * 100).toFixed(1)}%로 가장 좋음 → 비슷한 톤·구성을 더 자주.`,
      );
    }
    if (bestHour) {
      hints.push(`${bestHour} 발행이 반응이 가장 좋음 → 핵심 콘텐츠는 이 시간대에.`);
    }
    if (motifs.length >= 2) {
      hints.push(
        `'${motifs[0].key}' 계열 주제 그래픽이 잘 먹힘 → 비슷한 소재를 우선 기획.`,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      sampleSize: measured.length,
      variants,
      channels,
      hours,
      motifs,
      bestVariant,
      bestHour,
      hints,
    };
  }
}

/** 클라이언트별 학습 요약 저장소 (격리). data/<clientId>/learning.json */
export class LearningStore {
  constructor(private readonly baseDir: string) {}

  private fileFor(clientId: string): string {
    return join(this.baseDir, clientId, 'learning.json');
  }

  load(clientId: string): LearningSummary | undefined {
    const file = this.fileFor(clientId);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as LearningSummary;
      } catch {
        /* fallthrough */
      }
    }
    return undefined;
  }

  save(clientId: string, summary: LearningSummary): void {
    const file = this.fileFor(clientId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(summary, null, 2), 'utf8');
  }
}

export type { PlatformId };
