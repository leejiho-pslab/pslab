import type { MediaAsset, PlatformId, PostContent } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('content');

/** 콘텐츠 생성 요청 */
export interface ContentBrief {
  /** 주제/키워드 */
  topic: string;
  /** 톤앤매너 (예: '전문적', '캐주얼', '유머러스') */
  tone?: string;
  /** 화자 페르소나 — "누가" 1인칭으로 (카피 품질의 핵심) */
  persona?: string;
  /** 타겟 독자 — "누구에게" */
  audience?: string;
  /**
   * 이 글의 각도/관점 — 같은 주제라도 매번 다른 시선으로.
   * 예: "현장 실패담", "흔한 오해 바로잡기", "실전 체크리스트"
   */
  angle?: string;
  /** 추천 콘텐츠 형식 (예: '카드뉴스', '롱폼 글') */
  format?: string;
  /** 핵심 메시지/요점 */
  keyPoints?: string[];
  /** 목표 플랫폼 (플랫폼별 길이/형식 최적화에 사용) */
  targetPlatform?: PlatformId;
  /** 함께 생성/첨부할 미디어 요청 */
  media?: MediaRequest[];
  /** 운영자 브랜드 노트(분석·방향성·감도) — 프롬프트에 최우선 반영 */
  brandNotes?: string;
  /** 대상 채널의 핵심 가이드 — 프롬프트에 반영 */
  channelGuide?: string;
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

/**
 * 프로바이더가 없을 때 사용하는 결정론적 템플릿 생성기.
 * AI 키 없이도 "초안 골격"은 갖추도록 — 후킹/본문/마무리 구조를 잡아 둔다.
 * (진짜 전문가 카피는 ANTHROPIC_API_KEY 연결 시 Claude가 작성)
 */
export function templateText(brief: ContentBrief): {
  title: string;
  body: string;
  tags: string[];
} {
  const angleLabel = brief.angle ? brief.angle.split(' — ')[0] : '';
  const hook = angleLabel
    ? `${brief.topic}, ${angleLabel} 관점에서 풀어봅니다.`
    : `${brief.topic} — 현장에서 자주 마주치는 이야기.`;
  const lead = brief.audience
    ? `${brief.audience}이라면 한 번쯤 부딪히는 지점이죠.`
    : '실무에서 자주 부딪히는 지점을 짚어봅니다.';
  const points =
    brief.keyPoints && brief.keyPoints.length > 0
      ? brief.keyPoints.map((p) => `· ${p}`).join('\n')
      : '';
  const cta = brief.link
    ? `자세히 보기 → ${brief.link}`
    : '여러분의 경험은 어떤가요? 댓글로 남겨주세요.';
  const body = [hook, lead, points, cta].filter(Boolean).join('\n\n');

  const tags = [
    ...brief.topic.split(/\s+/).filter((w) => w.length > 1),
    ...(brief.keyPoints ?? []).slice(0, 2),
    brief.tone ?? 'pslab',
  ]
    .map((t) => t.replace(/\s+/g, ''))
    .filter(Boolean)
    .slice(0, 6);

  return { title: brief.topic, body, tags };
}
