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
import { upcomingSlots } from './plan.js';
import { createLogger } from './logger.js';

const log = createLogger('generate');

const DEFAULT_MODEL = process.env.PSLAB_CLAUDE_MODEL ?? 'claude-opus-4-8';
const MOTIFS = ['chart', 'lock', 'compass', 'branch', 'rocket', 'bulb', 'growth'];
const VARIANTS = ['A', 'B', 'C'];

/** 채널별 형식 가이드 (프롬프트에 주입) */
const CHANNEL_GUIDE: Record<string, string> = {
  instagram:
    '인스타그램 캐러셀. slides에 내용 4~5장(WHY → 01/02/03 → 정리). 각 슬라이드는 label(예 "WHY","01","정리"), title(짧게), body(2~3줄). captionBody는 발행 캡션 전문 + 해시태그.',
  threads:
    '스레드 타래(대화체, 짧게). slides는 비움([]). captionBody에 2~4개 짧은 단락으로 타래 구성.',
  'naver-blog':
    '네이버 블로그 롱폼. slides는 비움([]). captionBody에 "# 제목"과 "## 소제목" 구조의 정보형 글(800자+).',
  youtube:
    '유튜브 쇼츠 대본. slides는 비움([]). captionBody에 [HOOK]/[본론]/[CTA] 구조의 30~45초 대본.',
  linkedin:
    '링크드인 비즈니스 포스트. slides는 비움([]). captionBody에 전문적 톤의 인사이트 글.',
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
}

export class ContentGenerator {
  constructor(private readonly opts: { apiKey: string; model?: string }) {}

  /** 한 채널의 검수 대기 기획안 N건을 생성한다. */
  async generate(
    client: ClientConfig,
    opts: GenerateOptions,
  ): Promise<PlanItem[]> {
    const guide = CHANNEL_GUIDE[opts.channel] ?? CHANNEL_GUIDE.instagram;
    const system = [
      `당신은 "${client.persona ?? client.name}" 입니다. 그 사람의 1인칭 목소리로 SNS 콘텐츠를 기획합니다.`,
      client.audience ? `독자: ${client.audience}.` : '',
      client.contentPillars?.length ? `콘텐츠 기둥: ${client.contentPillars.join(', ')}.` : '',
      `말투: ${client.brandTone}.`,
      `채널 형식 — ${guide}`,
      '규칙: 뻔한 인사 금지. 구체적 사례·숫자·관점·실행 포인트. 과장·클릭베이트 금지.',
      `금지어: ${client.bannedWords.join(', ') || '없음'}.`,
      'headline은 스크롤을 멈추게 하는 한 줄(핵심어는 *별표*, 줄바꿈 <br>). 서로 다른 소재로 다양하게.',
    ]
      .filter(Boolean)
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
      variant: VARIANTS[Math.floor(i / 3) % VARIANTS.length], // 3건 단위 A/B/C
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
