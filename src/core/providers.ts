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
import type { TextProvider, MediaProvider, ContentBrief, MediaRequest } from './content.js';
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

// ──────────────────────────────────────────────────────────────
// 이미지 생성 (Gemini 나노바나나) + 공개 URL 호스팅
// ──────────────────────────────────────────────────────────────

const GEMINI_IMAGE_MODEL =
  process.env.PSLAB_GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image';

/** 생성된 이미지 바이트를 공개 http(s) URL로 만들어 주는 호스트. */
export interface ImageHost {
  /** 이미지 바이트 → 공개 URL */
  host(base64: string, opts: { filename: string; mime: string }): Promise<string>;
}

/**
 * imgbb 무료 이미지 호스팅. base64를 올리고 즉시 공개 URL을 받는다.
 * (Instagram이 이 URL에서 이미지를 가져감)
 */
export class ImgbbImageHost implements ImageHost {
  constructor(private readonly apiKey: string) {}

  async host(base64: string): Promise<string> {
    const body = new URLSearchParams({ key: this.apiKey, image: base64 });
    const res = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json?.data?.url) {
      throw new Error(`imgbb 업로드 실패: ${json?.error?.message ?? res.status}`);
    }
    return json.data.url as string;
  }
}

/**
 * Gemini(나노바나나) 이미지 생성 프로바이더.
 * 프롬프트 → 이미지 바이트 → 호스트 업로드 → 공개 URL의 MediaAsset.
 */
export class GeminiImageProvider implements MediaProvider {
  constructor(
    private readonly opts: { apiKey: string; host: ImageHost; model?: string },
  ) {}

  async generate(request: MediaRequest): Promise<MediaAsset> {
    const model = this.opts.model ?? GEMINI_IMAGE_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.opts.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }],
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Gemini 생성 실패: ${json?.error?.message ?? res.status}`);
    }
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    if (!imgPart) {
      throw new Error('Gemini 응답에 이미지가 없습니다.');
    }
    const base64: string = imgPart.inlineData.data;
    const mime: string = imgPart.inlineData.mimeType ?? 'image/png';
    const ext = mime.includes('jpeg') ? 'jpg' : 'png';
    const publicUrl = await this.opts.host.host(base64, {
      filename: `pslab-${Date.now()}.${ext}`,
      mime,
    });
    log.info(`이미지 생성·호스팅 완료 → ${publicUrl}`);
    return {
      kind: request.kind === 'video' ? 'image' : request.kind, // 나노바나나는 이미지
      source: publicUrl,
      alt: request.prompt.slice(0, 100),
      mimeType: mime,
    };
  }
}

/** 환경에서 이미지 호스트를 만든다 (현재 imgbb 지원). */
export function createImageHost(): ImageHost | undefined {
  const imgbb = process.env.IMGBB_API_KEY;
  if (imgbb) return new ImgbbImageHost(imgbb);
  return undefined;
}

/**
 * 이미지 생성 프로바이더를 만든다.
 * GEMINI_API_KEY + 이미지 호스트(IMGBB_API_KEY)가 모두 있어야 활성화.
 * 하나라도 없으면 undefined → 플레이스홀더 폴백.
 */
export function createMediaProvider(): MediaProvider | undefined {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return undefined;
  const host = createImageHost();
  if (!host) {
    log.warn('GEMINI_API_KEY는 있으나 이미지 호스트(IMGBB_API_KEY)가 없어 이미지 생성 비활성화');
    return undefined;
  }
  log.info(`Gemini 이미지 생성 활성화 (모델: ${GEMINI_IMAGE_MODEL})`);
  return new GeminiImageProvider({ apiKey, host });
}

export type { MediaAsset };
