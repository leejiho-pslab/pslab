import type { MediaAsset, PlatformId, PostContent } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('content');

/** 콘텐츠 생성 요청 */
export interface ContentBrief {
  /** 주제/키워드 */
  topic: string;
  /** 톤앤매너 (예: '전문적', '캐주얼', '유머러스') */
  tone?: string;
  /** 핵심 메시지/요점 */
  keyPoints?: string[];
  /** 목표 플랫폼 (플랫폼별 길이/형식 최적화에 사용) */
  targetPlatform?: PlatformId;
  /** 함께 생성/첨부할 미디어 요청 */
  media?: MediaRequest[];
  /** 콜투액션 / 링크 */
  link?: string;
}

export interface MediaRequest {
  kind: 'image' | 'video' | 'thumbnail';
  /** 이미지/영상 생성 프롬프트 */
  prompt: string;
}

/**
 * 텍스트 생성 프로바이더 인터페이스.
 * 외부 LLM(예: Claude API)을 연결하려면 이 인터페이스를 구현해 주입한다.
 */
export interface TextProvider {
  generate(brief: ContentBrief): Promise<{
    title?: string;
    body: string;
    tags: string[];
  }>;
}

/**
 * 미디어 생성 프로바이더 인터페이스.
 * Higgsfield, Canva 등 이미지/영상 생성 도구를 여기에 연결한다.
 */
export interface MediaProvider {
  generate(request: MediaRequest): Promise<MediaAsset>;
}

/**
 * 콘텐츠 생성 파이프라인.
 *
 * 텍스트/미디어 프로바이더를 조합해 발행 가능한 PostContent를 만든다.
 * 프로바이더가 없으면 결정론적 템플릿 폴백을 사용하므로 키 없이도 동작한다.
 */
export class ContentPipeline {
  constructor(
    private readonly providers: {
      text?: TextProvider;
      media?: MediaProvider;
    } = {},
  ) {}

  async generate(brief: ContentBrief): Promise<PostContent> {
    log.info(`콘텐츠 생성 — 주제: "${brief.topic}"`);

    const text = this.providers.text
      ? await this.providers.text.generate(brief)
      : templateText(brief);

    const media: MediaAsset[] = [];
    for (const req of brief.media ?? []) {
      if (this.providers.media) {
        media.push(await this.providers.media.generate(req));
      } else {
        // 폴백: 실제 자산 대신 생성 요청을 플레이스홀더로 남긴다.
        media.push({
          kind: req.kind,
          source: `generated://${req.kind}?prompt=${encodeURIComponent(req.prompt)}`,
          alt: req.prompt,
        });
        log.debug(`미디어 프로바이더 미연결 — 플레이스홀더 생성 (${req.kind})`);
      }
    }

    return {
      title: text.title,
      body: text.body,
      tags: text.tags,
      media: media.length > 0 ? media : undefined,
      link: brief.link,
    };
  }
}

/** 프로바이더가 없을 때 사용하는 결정론적 템플릿 생성기 */
function templateText(brief: ContentBrief): {
  title: string;
  body: string;
  tags: string[];
} {
  const title = brief.topic;
  const points =
    brief.keyPoints && brief.keyPoints.length > 0
      ? brief.keyPoints.map((p) => `• ${p}`).join('\n')
      : '';
  const bodyParts = [
    `${brief.topic}에 대해 이야기해 볼게요.`,
    points,
    brief.link ? `자세히 보기 → ${brief.link}` : '',
  ].filter(Boolean);

  const tags = [
    ...brief.topic.split(/\s+/).filter((w) => w.length > 1),
    brief.tone ?? 'pslab',
  ].slice(0, 5);

  return { title, body: bodyParts.join('\n\n'), tags };
}
