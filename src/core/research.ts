/**
 * 시장 조사 / 소재 수집 (설계도 1번 작업소)
 *
 * 경쟁사·트렌드를 모니터링해 "오늘의 소재 후보"를 만든다.
 * 과거 성과(reinforcement)를 반영해, 반응이 좋았던 방향을 더 밀어 준다.
 *
 * 실제 데이터 소스(NaverSearch, YouTubeData, 경쟁사 스크랩 등)는
 * ResearchProvider 인터페이스로 주입한다. 없으면 결정론적 mock으로 동작한다.
 */
import type { PlatformId } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('research');

/** 모니터링 대상 경쟁사/벤치마킹 계정 */
export interface CompetitorRef {
  /** 계정 핸들 또는 채널명 */
  handle: string;
  platform?: PlatformId;
  note?: string;
}

/** 트렌드 신호 (떠오르는 키워드) */
export interface TrendSignal {
  keyword: string;
  /** 0~100 상대 강도 */
  score: number;
  source: string;
}

/** 경쟁사 1곳을 관찰한 벤치마킹 결과 */
export interface BenchmarkInsight {
  competitor: string;
  /** 가장 잘 먹힌 콘텐츠 형식 (예: '짧은 영상', '카드뉴스') */
  topFormat: string;
  /** 가장 반응 좋았던 주제 */
  topTopic: string;
  /** 관찰된 참여율 (0~1) */
  engagementRate: number;
  observedAt: string;
}

/** 제작으로 넘길 소재 후보 한 건 */
export interface TopicCandidate {
  topic: string;
  /** 이 소재를 고른 근거 */
  rationale: string;
  /** 0~100 추천 점수 (높을수록 우선) */
  score: number;
  /** 추천 형식 */
  suggestedFormat: string;
  /** 이 글을 풀어갈 각도/관점 (같은 주제라도 매번 다르게) */
  angle: string;
}

export interface ResearchResult {
  trends: TrendSignal[];
  benchmarks: BenchmarkInsight[];
  /** 점수 내림차순 정렬된 소재 후보 */
  topicCandidates: TopicCandidate[];
  collectedAt: string;
}

export interface ResearchInput {
  industry: string;
  keywords: string[];
  competitors: CompetitorRef[];
  /**
   * 과거에 반응이 좋았던 주제/형식 (학습실 → 다음 사이클로 전달되는 강화 신호).
   * 여기 담긴 키워드와 겹치는 후보는 점수가 가산된다.
   */
  reinforcement?: {
    favoredTopics?: string[];
    favoredFormats?: string[];
  };
  /**
   * 최근에 이미 다룬 주제들 (중복 회피용). 여기 담긴 주제는 점수가 깎여
   * 매 사이클 같은 주제만 반복되는 것을 막고 소재가 회전한다.
   */
  recentTopics?: string[];
}

/**
 * 외부 데이터 소스 어댑터.
 * 실제 검색/모니터링 API나 MCP를 여기에 연결한다.
 */
export interface ResearchProvider {
  fetchTrends(input: ResearchInput): Promise<TrendSignal[]>;
  observeCompetitors(input: ResearchInput): Promise<BenchmarkInsight[]>;
}

const FORMATS = ['짧은 영상', '카드뉴스', '롱폼 글', '이미지 1장', '릴스'];

/**
 * 전문가 콘텐츠 각도 풀 — 같은 키워드라도 매번 다른 시선으로 풀게 한다.
 * 카피 엔진(Claude)에 전달되어 글의 구체적 방향을 잡는다.
 */
const ANGLES = [
  '현장 경험담 — 실제로 겪은 사례 한 가지를 중심으로',
  '흔한 오해 바로잡기 — 많은 사람이 잘못 알고 있는 지점',
  '실패에서 배운 교훈 — 돈·시간 태우고 깨달은 것',
  '실전 체크리스트 — 바로 적용하는 핵심 몇 가지',
  '비포/애프터 — 개선 전후를 숫자로 비교',
  '지금 왜 중요한가 — 트렌드 변화와 그 의미 해설',
  '이럴 땐 이렇게 — 상황별 의사결정 기준',
];

/** 문자열 시드 → 의사난수 (결정론적 mock 데이터용) */
function seed(s: string): (n: number) => number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (n: number) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return h % n;
  };
}

/**
 * 시장 조사실.
 *
 * provider가 있으면 실제 데이터로, 없으면 입력값 기반 결정론적 mock으로
 * 트렌드·벤치마킹·소재 후보를 만든다.
 */
export class MarketResearch {
  constructor(private readonly provider?: ResearchProvider) {}

  async investigate(input: ResearchInput): Promise<ResearchResult> {
    log.info(
      `시장 조사 — 업종:"${input.industry}", 키워드 ${input.keywords.length}개, 경쟁사 ${input.competitors.length}곳`,
    );

    const trends = this.provider
      ? await this.provider.fetchTrends(input)
      : this.mockTrends(input);

    const benchmarks = this.provider
      ? await this.provider.observeCompetitors(input)
      : this.mockBenchmarks(input);

    const topicCandidates = this.buildCandidates(input, trends, benchmarks);

    return {
      trends,
      benchmarks,
      topicCandidates,
      collectedAt: new Date().toISOString(),
    };
  }

  /** 키워드 → 트렌드 신호 (mock) */
  private mockTrends(input: ResearchInput): TrendSignal[] {
    return input.keywords.map((keyword) => {
      const rand = seed(`trend:${input.industry}:${keyword}`);
      return {
        keyword,
        score: 40 + rand(60),
        source: 'mock:trend',
      };
    });
  }

  /** 경쟁사 → 벤치마킹 인사이트 (mock) */
  private mockBenchmarks(input: ResearchInput): BenchmarkInsight[] {
    const now = new Date().toISOString();
    return input.competitors.map((c) => {
      const rand = seed(`bench:${c.handle}`);
      const topic =
        input.keywords[rand(Math.max(1, input.keywords.length))] ??
        input.industry;
      return {
        competitor: c.handle,
        topFormat: FORMATS[rand(FORMATS.length)],
        topTopic: topic,
        engagementRate: 0.02 + rand(80) / 1000,
        observedAt: now,
      };
    });
  }

  /**
   * 트렌드 + 벤치마킹 + 강화 신호를 합쳐 소재 후보에 점수를 매긴다.
   * - 트렌드 점수를 기본 점수로
   * - 경쟁사가 같은 주제로 반응 좋았으면 가산
   * - 과거 반응 좋았던 주제/형식이면 가산 (강화)
   */
  private buildCandidates(
    input: ResearchInput,
    trends: TrendSignal[],
    benchmarks: BenchmarkInsight[],
  ): TopicCandidate[] {
    const favoredTopics = new Set(
      (input.reinforcement?.favoredTopics ?? []).map((t) => t.toLowerCase()),
    );
    const favoredFormats = new Set(input.reinforcement?.favoredFormats ?? []);
    // 최근 주제는 점수를 깎아 매 사이클 같은 주제만 반복되는 것을 막는다.
    const recentPenalty = new Map<string, number>();
    (input.recentTopics ?? []).forEach((t, i, arr) => {
      // 가장 최근 항목에 가장 큰 페널티 → 직전 주제는 연속 선택되지 않고
      // 여러 사이클 뒤에야 다시 떠오른다 (강화 가산보다 확실히 크게).
      recentPenalty.set(t.toLowerCase(), 45 + (arr.length - i) * 10);
    });

    const candidates: TopicCandidate[] = trends.map((t) => {
      const rand = seed(`cand:${t.keyword}`);
      let score = t.score;
      const reasons: string[] = [`트렌드 강도 ${t.score}`];

      // 경쟁사가 같은 키워드로 터졌는지
      const match = benchmarks.find((b) =>
        b.topTopic.toLowerCase().includes(t.keyword.toLowerCase()),
      );
      let suggestedFormat = FORMATS[rand(FORMATS.length)];
      if (match) {
        score += 15;
        suggestedFormat = match.topFormat;
        reasons.push(`경쟁사 '${match.competitor}'가 ${match.topFormat}로 호응`);
      }

      // 강화: 과거 반응 좋았던 주제/형식
      if (favoredTopics.has(t.keyword.toLowerCase())) {
        score += 20;
        reasons.push('과거 반응 좋았던 주제(강화)');
      }
      if (favoredFormats.has(suggestedFormat)) {
        score += 10;
        reasons.push(`과거 반응 좋았던 형식 '${suggestedFormat}'(강화)`);
      }

      // 회전: 최근 다룬 주제는 점수를 깎아 다른 소재에 기회를 준다
      const penalty = recentPenalty.get(t.keyword.toLowerCase());
      if (penalty) {
        score -= penalty;
        reasons.push('최근 다룸(회전)');
      }

      // 각도: 키워드 + 최근 사용 횟수로 회전시켜 같은 주제도 매번 다르게
      const angleSalt = (input.recentTopics ?? []).filter(
        (r) => r.toLowerCase() === t.keyword.toLowerCase(),
      ).length;
      const angle = ANGLES[seed(`angle:${t.keyword}:${angleSalt}`)(ANGLES.length)];

      return {
        topic: t.keyword,
        rationale: reasons.join(' · '),
        score: Math.max(0, Math.min(100, Math.round(score))),
        suggestedFormat,
        angle,
      };
    });

    return candidates.sort((a, b) => b.score - a.score);
  }
}
