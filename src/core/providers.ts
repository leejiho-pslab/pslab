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
import { templateText } from './content.js';
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

/** 플랫폼별 분량·형식 가이드 */
function platformGuide(p?: string): string {
  switch (p) {
    case 'instagram':
      return '인스타그램: 첫 줄(후킹)이 생명. 본문 600~1000자, 짧은 문단·줄바꿈으로 가독성. 끝에 해시태그와 어울리는 자연스러운 마무리.';
    case 'threads':
      return '스레드: 대화체로 짧고 밀도 있게(300~500자). 한 가지 인사이트만 날카롭게.';
    case 'naver-blog':
      return '네이버 블로그: 소제목으로 구조화한 롱폼(1500자+). 검색 의도에 답하는 정보형. 경험·근거·예시를 충분히.';
    case 'linkedin':
      return '링크드인: 비즈니스 인사이트 톤. 첫 2줄 후킹 후 핵심 주장→근거→교훈. 800~1200자.';
    case 'youtube':
      return '유튜브: 영상 설명/스크립트 톤. 후킹 한 줄 + 핵심 3~5줄 + 행동 유도.';
    default:
      return 'SNS 피드: 첫 줄 후킹, 짧은 문단, 구체적 사례 중심.';
  }
}

function systemPrompt(brief: ContentBrief): string {
  const persona =
    brief.persona ??
    '해당 분야에서 오래 일한 실무 전문가. 현장 경험을 바탕으로 솔직하게 말한다';
  return [
    `당신은 "${persona}" 입니다. 그 사람의 목소리로 1인칭으로 직접 글을 씁니다 — 외주 카피라이터가 아니라 본인입니다.`,
    brief.audience ? `독자: ${brief.audience}. 이들이 "이건 진짜 현업 사람이 쓴 글이다"라고 느끼게 하세요.` : '',
    brief.tone ? `말투: ${brief.tone}.` : '',
    platformGuide(brief.targetPlatform),
    brief.brandNotes
      ? `\n[운영자 브랜드 노트 — 최신 지침. 아래 내용을 최우선으로 반영]\n${brief.brandNotes}`
      : '',
    brief.channelGuide
      ? `\n[이 채널의 핵심 가이드 — 운영자가 정한 규칙. 반드시 따를 것]\n${brief.channelGuide}`
      : '',
    '',
    '[좋은 글의 조건]',
    '1) 첫 문장에서 멈추게 한다 — 뻔한 인사("~에 대해 알아볼게요") 절대 금지. 구체적 장면·숫자·반론·질문으로 시작.',
    '2) 추상론 금지. 실제 사례·수치·비교·"이렇게 하면 이렇게 된다"의 구체성을 담는다.',
    '3) 교과서 요약이 아니라 관점/주장이 있어야 한다. 무엇을 하라/하지 말라가 분명히.',
    '4) 독자가 바로 써먹을 한 가지(실행 포인트)를 반드시 남긴다.',
    '5) 진정성 > 과장. 클릭베이트·영혼 없는 미사여구·이모지 남발 금지.',
    '',
    'title은 스크롤을 멈추게 하는 한 줄. body는 위 조건을 갖춘 완성 본문. tags는 # 없이 핵심 키워드 4~6개(붙여쓰기).',
  ]
    .filter((x) => x !== '')
    .join('\n');
}

function userPrompt(brief: ContentBrief): string {
  const lines = [`주제(소재): ${brief.topic}`];
  if (brief.angle) lines.push(`이번 글의 각도/관점: ${brief.angle}`);
  if (brief.format) lines.push(`형식 힌트: ${brief.format}`);
  if (brief.keyPoints && brief.keyPoints.length > 0)
    lines.push(`참고 포인트:\n- ${brief.keyPoints.join('\n- ')}`);
  if (brief.link) lines.push(`링크(CTA): ${brief.link}`);
  lines.push(
    '\n위 소재를, 지정된 각도로, 당신의 실제 경험담처럼 구체적으로 써주세요. 같은 주제라도 매번 다른 사례와 시선으로.',
  );
  return lines.join('\n');
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
      return templateText(brief);
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
// 이미지 생성 (무료 Pollinations 기본 / Gemini 선택) + 공개 URL 호스팅
// ──────────────────────────────────────────────────────────────

const IMAGE_W = Number(process.env.PSLAB_IMAGE_WIDTH ?? 1080);
const IMAGE_H = Number(process.env.PSLAB_IMAGE_HEIGHT ?? 1080);
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

/** 이미지 생성기 — 프롬프트 → 이미지 바이트(base64). */
export interface ImageGenerator {
  generate(prompt: string): Promise<{ base64: string; mime: string }>;
}

/**
 * Pollinations.ai 이미지 생성 — **완전 무료, API 키 불필요** (Flux 모델).
 * 기본 이미지 생성기.
 */
export class PollinationsImageGenerator implements ImageGenerator {
  constructor(private readonly opts: { model?: string } = {}) {}

  async generate(prompt: string): Promise<{ base64: string; mime: string }> {
    const model = this.opts.model ?? process.env.PSLAB_POLLINATIONS_MODEL ?? 'flux';
    const seed = Date.now() % 1_000_000;
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${IMAGE_W}&height=${IMAGE_H}&nologo=true&model=${model}&seed=${seed}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Pollinations 생성 실패: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') ?? 'image/jpeg';
    return { base64: buf.toString('base64'), mime };
  }
}

/** Gemini(나노바나나) 이미지 생성 — 유료(빌링 필요). 선택 시 사용. */
export class GeminiImageGenerator implements ImageGenerator {
  constructor(private readonly opts: { apiKey: string; model?: string }) {}

  async generate(prompt: string): Promise<{ base64: string; mime: string }> {
    const model = this.opts.model ?? GEMINI_IMAGE_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.opts.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Gemini 생성 실패: ${json?.error?.message ?? res.status}`);
    }
    const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p) => p.inlineData?.data);
    if (!imgPart) throw new Error('Gemini 응답에 이미지가 없습니다.');
    return {
      base64: imgPart.inlineData.data,
      mime: imgPart.inlineData.mimeType ?? 'image/png',
    };
  }
}

/** 생성기 + 호스트를 조합한 미디어 프로바이더. */
export class HostedImageProvider implements MediaProvider {
  constructor(
    private readonly generator: ImageGenerator,
    private readonly host: ImageHost,
  ) {}

  async generate(request: MediaRequest): Promise<MediaAsset> {
    const { base64, mime } = await this.generator.generate(request.prompt);
    const ext = mime.includes('png') ? 'png' : 'jpg';
    const url = await this.host.host(base64, {
      filename: `pslab-${Date.now()}.${ext}`,
      mime,
    });
    log.info(`이미지 생성·호스팅 완료 → ${url}`);
    return {
      kind: request.kind === 'video' ? 'image' : request.kind,
      source: url,
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
 * 이미지 생성기를 만든다.
 * 기본은 **무료 Pollinations**. PSLAB_IMAGE_GEN=gemini + GEMINI_API_KEY면 Gemini.
 * PSLAB_IMAGE_GEN=none이면 이미지 생성 끔.
 */
export function createImageGenerator(): ImageGenerator | undefined {
  const mode = process.env.PSLAB_IMAGE_GEN;
  if (mode === 'none') return undefined;
  if (mode === 'gemini' && process.env.GEMINI_API_KEY) {
    return new GeminiImageGenerator({ apiKey: process.env.GEMINI_API_KEY });
  }
  return new PollinationsImageGenerator(); // 무료 기본
}

/**
 * 이미지 미디어 프로바이더를 만든다.
 * 이미지 생성기(기본 무료) + 호스트(IMGBB_API_KEY)가 있어야 활성화.
 * 호스트가 없으면 undefined → 플레이스홀더 폴백.
 */
export function createMediaProvider(): MediaProvider | undefined {
  const generator = createImageGenerator();
  if (!generator) return undefined;
  const host = createImageHost();
  if (!host) {
    log.warn('이미지 호스트(IMGBB_API_KEY)가 없어 이미지 생성 비활성화');
    return undefined;
  }
  log.info(`이미지 생성 활성화 (${generator.constructor.name})`);
  return new HostedImageProvider(generator, host);
}

export type { MediaAsset };
