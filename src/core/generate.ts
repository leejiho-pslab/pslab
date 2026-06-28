/**
 * 콘텐츠 기획 자동 생성기 (Claude) — 설계도 "제작 자동화"
 *
 * 클라이언트 페르소나/타겟/기둥 + 채널 형식에 맞춰, 검수 대기 기획안(PlanItem)을
 * 채널별로 자동 생성한다. ANTHROPIC_API_KEY가 있을 때만 동작하며, 결과는
 * 발행 전 'planned' 상태로 plan.json에 쌓여 대시보드에서 사람이 검수한다.
 *
 * 손으로 만든 인스타 캐러셀과 동일한 스키마(headline/slides/captionBody)를 생성하므로
 * 렌더러·대시보드가 그대로 카드/캐러셀로 보여준다.
 */
import type { ClientConfig } from './client.js';
import type { PlanItem, PlanSlide } from './plan.js';
import type { PlatformId } from './types.js';
import type { LearningSummary } from './learning.js';
import { upcomingSlots } from './plan.js';
import { createLogger } from './logger.js';

const log = createLogger('generate');

const DEFAULT_MODEL = process.env.PSLAB_CLAUDE_MODEL ?? 'claude-opus-4-8';
const MOTIFS = ['chart', 'lock', 'compass', 'branch', 'rocket', 'bulb', 'growth'];
const VARIANTS = ['A', 'B', 'C'];

/**
 * 콘텐츠 기획 원칙 — 모든 채널의 모든 콘텐츠가 따른다.
 * (생성 엔진 프롬프트 + 수기 큐레이션의 공통 기준)
 */
export const CONTENT_DOCTRINE = [
  '[콘텐츠 기획 5원칙 — 예외 없이 적용]',
  '1) 경험담 기반: 1인칭 실제 경험·사례로. "제가 ○○했을 때"처럼 구체적 장면과 숫자로. 일반론·교과서 요약 금지.',
  '2) 결론 우선(BLUF): 핵심 결론/답을 맨 앞에 한 줄로 박고, 그 뒤에 왜 그런지를 스토리로 풀어간다.',
  '3) 시의성·이슈성: 지금 시점의 트렌드·계절·업계 이슈와 연결한 후킹으로 시작한다.',
  '4) SEO·GEO: 검색 키워드를 제목·소제목에 자연스럽게 녹이고, AI 답변엔진이 인용하기 쉽게 명확한 주장·정의·FAQ·요약을 포함한다.',
  '5) 채널 어휘: 채널 특성에 맞는 말투로 변환한다(블로그=정보형 존댓말, 스레드=캐주얼 구어, 링크드인=비즈니스, 인스타=짧고 임팩트, 유튜브=말하는 대본).',
].join('\n');

/** 채널별 형식 가이드 (프롬프트에 주입) */
const CHANNEL_GUIDE: Record<string, string> = {
  instagram:
    '인스타그램 캐러셀(짧고 임팩트 어휘). slides에 내용 4~5장(결론/후킹 → 경험 스토리 → 01/02/03 → 정리·저장 유도). 각 슬라이드는 label, title(짧게), body(2~3줄). captionBody는 결론 한 줄로 시작하는 캡션 전문 + 해시태그.',
  threads:
    '스레드 타래(반말 섞인 캐주얼 구어, 🧵). slides는 비움([]). captionBody는 결론 한 줄로 시작해 2~4개 짧은 단락으로 타래 구성.',
  'naver-blog':
    '네이버 블로그 롱폼(정보형 존댓말, 바로 발행 가능한 완성글 1000자+). slides 비움([]). captionBody 구조: "# SEO제목(핵심키워드 앞배치)" → "> [핵심 요약] 결론 2~3줄(GEO용 명확한 답)" → 경험담 도입 → "## 키워드형 소제목" 본문들 → "## 자주 묻는 질문" Q&A 2~3개(GEO) → 마무리 CTA → "🔖 태그: #키워드".',
  youtube:
    '유튜브 쇼츠 대본(말하는 구어체). slides 비움([]). captionBody는 [HOOK 0~3초: 결론/도발] → [본론: 경험 사례] → [CTA] 구조의 30~45초 대본.',
  linkedin:
    '링크드인 비즈니스 포스트(전문적·간결). slides 비움([]). captionBody는 결론 한 줄로 시작 → 경험담 → 인사이트 → 해시태그.',
};

const SLIDE_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['title', 'body'],
  additionalProperties: false,
} as const;

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string' },
    kicker: { type: 'string', description: '영문 라벨 (예: Marketing Insight)' },
    headline: { type: 'string', description: '강조어는 *별표*로 감싸고 줄바꿈은 <br>' },
    sub: { type: 'string' },
    dayLabel: { type: 'string' },
    motif: { type: 'string', enum: MOTIFS },
    captionBody: { type: 'string' },
    slides: { type: 'array', items: SLIDE_SCHEMA },
  },
  required: ['topic', 'kicker', 'headline', 'sub', 'motif', 'captionBody', 'slides'],
  additionalProperties: false,
} as const;

const RESULT_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: ITEM_SCHEMA } },
  required: ['items'],
  additionalProperties: false,
} as const;

export interface GenerateOptions {
  channel: PlatformId;
  count: number;
  /** 시작 시각 (없으면 now) */
  from?: Date;
  /** 지난 발행 성과 학습 (있으면 디자인·소재 선택에 되먹임) */
  learning?: LearningSummary;
}

export class ContentGenerator {
  constructor(private readonly opts: { apiKey: string; model?: string }) {}

  /** 한 채널의 검수 대기 기획안 N건을 생성한다. */
  async generate(
    client: ClientConfig,
    opts: GenerateOptions,
  ): Promise<PlanItem[]> {
    const guide = CHANNEL_GUIDE[opts.channel] ?? CHANNEL_GUIDE.instagram;
    const learnBlock =
      opts.learning && opts.learning.hints.length
        ? ['', '[지난 발행 성과 학습 — 이번 기획에 반영할 것]', ...opts.learning.hints.map((h) => `· ${h}`)].join('\n')
        : '';
    const system = [
      `당신은 "${client.persona ?? client.name}" 입니다. 그 사람의 1인칭 목소리로 SNS 콘텐츠를 기획합니다.`,
      client.audience ? `독자: ${client.audience}.` : '',
      client.contentPillars?.length ? `콘텐츠 기둥: ${client.contentPillars.join(', ')}.` : '',
      `말투: ${client.brandTone}.`,
      '',
      CONTENT_DOCTRINE,
      learnBlock,
      '',
      `채널 형식 — ${guide}`,
      '뻔한 인사 금지. 과장·클릭베이트 금지.',
      `금지어: ${client.bannedWords.join(', ') || '없음'}.`,
      'headline은 스크롤을 멈추게 하는 한 줄(핵심어는 *별표*, 줄바꿈 <br>). 서로 다른 소재로 다양하게.',
      'captionBody는 반드시 "결론 한 줄" 또는 "[핵심 요약]"으로 시작한 뒤 경험담 스토리로 풀 것.',
    ]
      .filter((x) => x !== undefined)
      .join('\n');

    const user = `다음 채널에 올릴 콘텐츠 ${opts.count}건을 기획해 주세요: ${opts.channel}.\n키워드 풀: ${client.keywords.join(', ')}.\n각 건은 서로 다른 소재/각도로.`;

    let parsed: { items: Partial<PlanItem>[] };
    try {
      const pkg = '@anthropic-ai/sdk';
      const mod: any = await import(pkg as string);
      const Anthropic = mod.default ?? mod.Anthropic;
      const ai = new Anthropic({ apiKey: this.opts.apiKey });
      const res: any = await ai.messages.create({
        model: this.opts.model ?? DEFAULT_MODEL,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        system,
        output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
        messages: [{ role: 'user', content: user }],
      });
      const text = (res.content ?? [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      parsed = JSON.parse(text);
    } catch (err) {
      log.error(`생성 실패 (${err instanceof Error ? err.message : err})`);
      throw err;
    }

    const slots = upcomingSlots(client.scheduleTimes, opts.from ?? new Date(), opts.count);
    // 디자인 변형 선택: 학습된 우세안이 있으면 더 자주(짝수 인덱스), 나머지는 탐색용 순환.
    const best = opts.learning?.bestVariant;
    const variantFor = (i: number): string =>
      best
        ? i % 2 === 0
          ? best
          : VARIANTS[Math.floor(i / 2) % VARIANTS.length]
        : VARIANTS[Math.floor(i / 3) % VARIANTS.length];
    return (parsed.items ?? []).slice(0, opts.count).map((it, i) => ({
      id: `${opts.channel}-gen-${slots[i].getTime()}`,
      topic: it.topic ?? '소재',
      format: opts.channel === 'instagram' ? '카드뉴스' : opts.channel,
      channels: [opts.channel],
      scheduledFor: slots[i].toISOString(),
      score: 80 - i,
      status: 'planned' as const,
      kicker: it.kicker,
      headline: it.headline,
      sub: it.sub,
      dayLabel: it.dayLabel ?? client.name,
      motif: MOTIFS.includes(it.motif as string) ? it.motif : 'compass',
      variant: variantFor(i), // 학습 우세안 가중 + 탐색
      palette: 'ink',
      captionBody: it.captionBody,
      captionNote: it.sub,
      rationale: it.sub,
      slides: (it.slides ?? []) as PlanSlide[],
    }));
  }
}

/** 환경에 키가 있으면 생성기를 만든다 (없으면 undefined). */
export function createContentGenerator(): ContentGenerator | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  return new ContentGenerator({ apiKey });
}
