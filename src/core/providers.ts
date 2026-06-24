/**
 * 콘텐츠 생성 프로바이더 어댑터 (설계도 2번 작업소 "실제 AI 제작")
 *
 * ContentPipeline의 TextProvider/MediaProvider 인터페이스를 실제 생성 도구에
 * 연결한다. 키가 있으면 실제 호출, 없으면 undefined를 돌려줘 템플릿 폴백을 쓴다.
 * → 키가 도착하면 코드 수정 없이 자동으로 실제 AI 생성으로 전환된다.
 *
 * 텍스트: Claude API (@anthropic-ai/sdk). 모델 기본값 claude-opus-4-8.
 *   - 환경변수 ANTHROPIC_API_KEY 가 있을 때만 활성화
 *   - 구조화 출력(output_config.format)으로 {title, body, tags} 보장
 *   - 적응형 사고(thinking: adaptive)
 *   - 실패 시 템플릿으로 폴백 → 한 번의 API 오류가 사이클을 깨지 않음
 */
import type { TextProvider, MediaProvider, ContentBrief } from './content.js';
import type { MediaAsset } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('providers');

/** 기본 모델 — 최신·최고 성능 Claude. 필요 시 PSLAB_CLAUDE_MODEL 로 교체. */
const DEFAULT_MODEL = process.env.PSLAB_CLAUDE_MODEL ?? 'claude-opus-4-8';

const CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['body', 'tags'],
  additionalProperties: false,
} as const;

function systemPrompt(brief: ContentBrief): string {
  return [
    '당신은 SNS 콘텐츠를 쓰는 전문 카피라이터입니다.',
    brief.tone ? `브랜드 말투: ${brief.tone}` : '',
    brief.targetPlatform ? `플랫폼: ${brief.targetPlatform} (해당 플랫폼 관습에 맞게)` : '',
    '결과는 한국어로, 자연스럽고 진정성 있게. 과장·클릭베이트 금지.',
    'title은 짧고 명확하게, body는 본문, tags는 # 없이 핵심 키워드 3~6개.',
  ]
    .filter(Boolean)
    .join('\n');
}

function userPrompt(brief: ContentBrief): string {
  const points =
    brief.keyPoints && brief.keyPoints.length > 0
      ? `\n참고 포인트:\n- ${brief.keyPoints.join('\n- ')}`
      : '';
  const link = brief.link ? `\n링크(CTA): ${brief.link}` : '';
  return `다음 주제로 게시물을 작성해 주세요.\n주제: ${brief.topic}${points}${link}`;
}

/** 프로바이더가 없을 때와 동일한 결정론적 템플릿 (폴백용) */
function templateFallback(brief: ContentBrief): {
  title: string;
  body: string;
  tags: string[];
} {
  const points =
    brief.keyPoints && brief.keyPoints.length > 0
      ? brief.keyPoints.map((p) => `• ${p}`).join('\n')
      : '';
  const body = [
    `${brief.topic}에 대해 이야기해 볼게요.`,
    points,
    brief.link ? `자세히 보기 → ${brief.link}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const tags = [
    ...brief.topic.split(/\s+/).filter((w) => w.length > 1),
    brief.tone ?? 'pslab',
  ].slice(0, 5);
  return { title: brief.topic, body, tags };
}

export class ClaudeTextProvider implements TextProvider {
  constructor(
    private readonly opts: { apiKey: string; model?: string },
  ) {}

  async generate(
    brief: ContentBrief,
  ): Promise<{ title?: string; body: string; tags: string[] }> {
    try {
      // 동적 import — @anthropic-ai/sdk 미설치/미사용 시 빌드에 영향 없음.
      // (specifier를 변수로 만들어 정적 모듈 해석을 피한다)
      const pkg = '@anthropic-ai/sdk';
      const mod: any = await import(pkg as string);
      const Anthropic = mod.default ?? mod.Anthropic;
      const client = new Anthropic({ apiKey: this.opts.apiKey });

      const res: any = await client.messages.create({
        model: this.opts.model ?? DEFAULT_MODEL,
        max_tokens: 2000,
        thinking: { type: 'adaptive' },
        system: systemPrompt(brief),
        output_config: { format: { type: 'json_schema', schema: CONTENT_SCHEMA } },
        messages: [{ role: 'user', content: userPrompt(brief) }],
      });

      const text = (res.content ?? [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      const parsed = JSON.parse(text) as {
        title?: string;
        body: string;
        tags?: string[];
      };
      return { title: parsed.title, body: parsed.body, tags: parsed.tags ?? [] };
    } catch (err) {
      log.warn(
        `Claude 생성 실패 → 템플릿 폴백 (${err instanceof Error ? err.message : err})`,
      );
      return templateFallback(brief);
    }
  }
}

/**
 * 환경에 따라 텍스트 프로바이더를 만든다.
 * ANTHROPIC_API_KEY 가 있으면 Claude, 없으면 undefined(→ 템플릿 폴백).
 */
export function createTextProvider(): TextProvider | undefined {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  log.info(`Claude 텍스트 생성 활성화 (모델: ${DEFAULT_MODEL})`);
  return new ClaudeTextProvider({ apiKey });
}

/**
 * 이미지/영상 생성 프로바이더 자리.
 * 현재는 미연결(undefined → 플레이스홀더). 이미지 생성 키가 준비되면
 * 여기서 해당 어댑터(예: Higgsfield/Canva)를 반환하도록 채운다.
 */
export function createMediaProvider(): MediaProvider | undefined {
  // TODO(key): 이미지/영상 생성 서비스 키가 오면 어댑터 연결
  return undefined;
}

/** 사용하지 않는 import 방지용 (MediaAsset는 향후 미디어 어댑터에서 사용) */
export type { MediaAsset };
