/**
 * 오케스트레이터 (설계도 "끝이 처음으로 이어지는 둥근 벨트")
 *
 * 한 클라이언트에 대해 전체 사이클을 한 바퀴 돌린다:
 *   시장조사 → 제작 → 검수 → 발행 → 성적표 → AI 회의 → (이력 저장·강화)
 *
 * 직전 사이클들의 방향(Direction)을 다음 사이클의 시장 조사에 강화 신호로
 * 넣어, 콘텐츠가 스스로 디벨롭되게 만든다.
 */
import type { ContentPipeline } from './content.js';
import type { Publisher, MultiPublishResult } from './publisher.js';
import { Analytics, type AggregatedReport } from './analytics.js';
import type { MarketResearch, ResearchResult } from './research.js';
import { ReviewGate, type ReviewDecision } from './review.js';
import { Council, type Direction } from './council.js';
import type { ClientConfig, ClientStore } from './client.js';
import type { AlertHub } from './alerts.js';
import type { DesignStudio, DesignStore, DesignStyle } from './design.js';
import type { PlanStore } from './plan.js';
import { generatePlan } from './plan.js';
import { GuidanceStore, brandNotesText } from './guidance.js';
import type { PlatformId } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('orchestrator');

/** 한 사이클의 전체 기록 (격리 저장소에 쌓인다) */
export interface CycleRecord {
  clientId: string;
  startedAt: string;
  finishedAt: string;
  topic: string;
  suggestedFormat: string;
  review: ReviewDecision;
  published: boolean;
  publishSummary?: { ok: number; total: number };
  avgEngagementRate: number;
  direction: Pick<Direction, 'focusTopics' | 'focusFormats' | 'rationale'>;
  /** 생성된 캡션(글) */
  caption?: string;
  /** 생성·호스팅된 대표 이미지 URL */
  imageUrl?: string;
  /** 채널별 발행 결과 */
  posts?: Array<{ platform: PlatformId; ok: boolean; url?: string; error?: string }>;
  /** 채널별 성과 지표 */
  metrics?: Array<{
    platform: PlatformId;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagementRate: number;
  }>;
  /** 사용된 디자인 스타일 버전 */
  designVersion?: number;
}

export interface OrchestratorDeps {
  content: ContentPipeline;
  publisher: Publisher;
  analytics: Analytics;
  research: MarketResearch;
  council: Council;
  /** 클라이언트별 검수 게이트 (없으면 클라이언트 설정으로 생성) */
  reviewGateFor?: (client: ClientConfig) => ReviewGate;
  store?: ClientStore<CycleRecord>;
  alerts?: AlertHub;
  /** 디자인 자가 진화 (이미지 프롬프트 스타일을 반응도로 업그레이드) */
  design?: { studio: DesignStudio; store: DesignStore };
  /** 콘텐츠 플랜(발행 대기 큐) 저장소 */
  plan?: PlanStore;
  /** 운영자 지침(브랜드 노트 + 채널 가이드) 저장소 */
  guidance?: GuidanceStore;
}

export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  /** 한 클라이언트에 대해 사이클을 한 바퀴 실행한다. */
  async runCycle(client: ClientConfig): Promise<CycleRecord> {
    const startedAt = new Date().toISOString();
    log.info(`▶ 사이클 시작 — ${client.name}(${client.id})`);

    // 0) 과거 이력에서 강화 신호 추출 + 운영자 지침(브랜드 노트·채널 가이드) 로드
    const history = this.deps.store?.read(client.id) ?? [];
    const reinforcement = this.extractReinforcement(history);
    const brief0 = this.deps.guidance?.loadBrief(client.id);
    const guides = this.deps.guidance?.loadGuides(client.id) ?? {};
    const chGuide = guides[client.targets[0]];
    if (chGuide?.topics?.length) {
      // 운영자가 정한 우선 소재를 강화 신호로 얹어 소재 선정에서 앞세운다
      reinforcement.favoredTopics = [
        ...chGuide.topics,
        ...reinforcement.favoredTopics,
      ].slice(0, 8);
    }

    // 1) 시장 조사 (경쟁사·트렌드 + 강화 + 최근 주제 회전)
    const recentTopics = history
      .slice(-5)
      .reverse()
      .map((h) => h.topic);
    const research: ResearchResult = await this.deps.research.investigate({
      industry: client.industry,
      keywords: [...new Set([...(chGuide?.topics ?? []), ...client.keywords])],
      competitors: client.competitors,
      reinforcement,
      recentTopics,
    });
    const pick = research.topicCandidates[0];
    if (!pick) {
      await this.deps.alerts?.emit('warn', '소재 후보 없음', {
        clientId: client.id,
        detail: '키워드/경쟁사 설정을 확인하세요.',
      });
      throw new Error(`${client.id}: 생성할 소재 후보가 없습니다.`);
    }

    // 1-1) 발행 대기 플랜 갱신 (이번에 쓰는 1순위 제외한 후보를 예정 큐로)
    //      manualPlan(검수 우선 큐레이션)이면 사람이 만든 기획안을 덮어쓰지 않는다.
    if (this.deps.plan && !client.manualPlan) {
      this.deps.plan.save(
        client.id,
        generatePlan(client, research.topicCandidates.slice(1), new Date()),
      );
    }

    // 2) 제작 (브랜드 말투 + 진화하는 디자인 스타일 반영)
    let designStyle: DesignStyle | undefined;
    let imagePrompt = `${pick.topic} 대표 이미지, ${client.brandTone}`;
    if (this.deps.design) {
      designStyle = this.deps.design.store.load(client.id);
      imagePrompt = this.deps.design.studio.buildPrompt({
        topic: pick.topic,
        format: pick.suggestedFormat,
        brandTone: client.brandTone,
        style: designStyle,
      });
    }
    const content = await this.deps.content.generate({
      topic: pick.topic,
      tone: client.brandTone,
      // 누가·누구에게·어떤 각도로 — 카피 품질의 핵심 컨텍스트
      persona: client.persona,
      audience: client.audience,
      angle: pick.angle,
      format: pick.suggestedFormat,
      targetPlatform: client.targets[0],
      media: [{ kind: 'image', prompt: imagePrompt }],
      brandNotes: brandNotesText(brief0),
      channelGuide: chGuide?.guide || undefined,
    });

    // 3) 검수 (스위치: manual/rules/auto)
    const gate =
      this.deps.reviewGateFor?.(client) ??
      new ReviewGate({
        mode: client.reviewMode,
        bannedWords: client.bannedWords,
        minBodyLength: 10,
      });
    const review = gate.review(content);

    // 4) 발행 (검수 통과 시에만)
    let publish: MultiPublishResult | undefined;
    let published = false;
    if (review.approved) {
      publish = await this.deps.publisher.publish(content, {
        targets: client.targets,
      });
      published = true;
      if (!publish.allOk) {
        await this.deps.alerts?.emit('error', '일부 채널 발행 실패', {
          clientId: client.id,
          detail: publish.results
            .filter((r) => !r.ok)
            .map((r) => `${r.platform}: ${r.error}`)
            .join('; '),
        });
      }
    } else if (review.pending) {
      await this.deps.alerts?.emit('info', '사람 승인 대기', {
        clientId: client.id,
        detail: `검수 스위치=manual. 주제: ${pick.topic}`,
      });
    } else {
      await this.deps.alerts?.emit('warn', '검수 보류', {
        clientId: client.id,
        detail: review.flags.join('; '),
      });
    }

    // 5) 성적표 (발행된 게시물 성과 수집)
    let report: AggregatedReport = {
      collectedAt: new Date().toISOString(),
      reports: [],
      totals: { views: 0, likes: 0, comments: 0, shares: 0, avgEngagementRate: 0 },
    };
    if (publish) {
      const tracked = Analytics.fromPublishResults(publish.results);
      report = await this.deps.analytics.collect(tracked);
    }

    // 6) AI 회의 → 다음 방향
    const direction = this.deps.council.deliberate({
      report,
      research,
      history: history.map((h) => ({
        avgEngagementRate: h.avgEngagementRate,
        topic: h.topic,
      })),
    });

    const record: CycleRecord = {
      clientId: client.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      topic: pick.topic,
      suggestedFormat: pick.suggestedFormat,
      review,
      published,
      publishSummary: publish
        ? {
            ok: publish.results.filter((r) => r.ok).length,
            total: publish.results.length,
          }
        : undefined,
      avgEngagementRate: report.totals.avgEngagementRate,
      direction: {
        focusTopics: direction.focusTopics,
        focusFormats: direction.focusFormats,
        rationale: direction.rationale,
      },
      caption: content.body,
      imageUrl: content.media?.find(
        (m) => m.kind === 'image' || m.kind === 'video',
      )?.source,
      posts: publish?.results.map((r) => ({
        platform: r.platform,
        ok: r.ok,
        url: r.url,
        error: r.error,
      })),
      metrics: report.reports.map((r) => ({
        platform: r.platform,
        views: r.metrics.views ?? 0,
        likes: r.metrics.likes ?? 0,
        comments: r.metrics.comments ?? 0,
        shares: r.metrics.shares ?? 0,
        engagementRate: r.metrics.engagementRate ?? 0,
      })),
      designVersion: designStyle?.version,
    };

    // 7) 격리 저장소에 이력 적재 (다음 사이클 강화 재료)
    this.deps.store?.append(client.id, record);

    // 7-1) 디자인 스타일 자가 진화 (회의 피드백 + 반응도)
    if (this.deps.design && designStyle) {
      const evolved = this.deps.design.studio.evolve(designStyle, {
        designNotes: direction.designNotes,
        engagement: report.totals.avgEngagementRate,
        prevEngagement: history.at(-1)?.avgEngagementRate,
      });
      this.deps.design.store.save(client.id, evolved);
      log.info(`디자인 스타일 v${evolved.version} 저장`);
    }
    log.info(
      `■ 사이클 완료 — ${client.name}: 주제="${pick.topic}", 발행=${published}, 참여율=${(report.totals.avgEngagementRate * 100).toFixed(1)}%`,
    );
    return record;
  }

  /** 과거 이력 → 다음 사이클 강화 신호 (반응 좋았던 주제/형식 추출) */
  private extractReinforcement(history: CycleRecord[]): {
    favoredTopics: string[];
    favoredFormats: string[];
  } {
    const scored = history
      .filter((h) => h.published)
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate)
      .slice(0, 3);
    return {
      favoredTopics: unique(scored.map((h) => h.topic)),
      favoredFormats: unique(scored.map((h) => h.suggestedFormat)),
    };
  }
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
