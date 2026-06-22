import { BasePlugin } from '../core/plugin.js';
import type {
  AnalyticsReport,
  PlatformId,
  PluginCredentials,
  PostContent,
  PublishResult,
} from '../core/types.js';
import { pseudoMetrics, simulateApiCall } from './shared.js';

/**
 * Instagram 플러그인 (Instagram Graph API).
 *
 * 실제 연동: 2단계 발행 — media container 생성 후 media_publish.
 * 필요한 자격 증명: accessToken(장기), igUserId(비즈니스 계정 ID).
 */
export class InstagramPlugin extends BasePlugin {
  readonly platform: PlatformId = 'instagram';
  readonly displayName = 'Instagram';

  /** Instagram 캡션 권장 길이 한계 */
  private static readonly CAPTION_LIMIT = 2200;
  private static readonly HASHTAG_LIMIT = 30;

  protected requiredCredentials(): string[] {
    return ['accessToken', 'igUserId'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    return simulateApiCall(`Instagram 계정(${creds.igUserId})`);
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    const hasImageOrVideo = content.media?.some(
      (m) => m.kind === 'image' || m.kind === 'video',
    );
    if (!hasImageOrVideo) {
      errors.push('Instagram은 이미지 또는 동영상(media)이 1개 이상 필요합니다.');
    }
    if (content.body.length > InstagramPlugin.CAPTION_LIMIT) {
      errors.push(`캡션은 ${InstagramPlugin.CAPTION_LIMIT}자 이하여야 합니다.`);
    }
    if ((content.tags?.length ?? 0) > InstagramPlugin.HASHTAG_LIMIT) {
      errors.push(`해시태그는 ${InstagramPlugin.HASHTAG_LIMIT}개 이하여야 합니다.`);
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    const media = content.media?.find(
      (m) => m.kind === 'image' || m.kind === 'video',
    );
    this.log.info(`피드 발행 (${media?.kind}: ${media?.source})`);

    // 실제 1단계: POST /{ig-user-id}/media → creation_id
    const creationId = await simulateApiCall(
      `igc_${Math.random().toString(36).slice(2, 10)}`,
    );
    // 실제 2단계: POST /{ig-user-id}/media_publish?creation_id=...
    const remoteId = await simulateApiCall(
      `ig_${creationId.slice(4)}_${Math.random().toString(36).slice(2, 6)}`,
    );
    return {
      platform: this.platform,
      ok: true,
      remoteId,
      url: `https://instagram.com/p/${remoteId}`,
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // 실제: GET /{ig-media-id}/insights?metric=impressions,reach,likes,...
    const metrics = await simulateApiCall(pseudoMetrics(`ig:${remoteId}`));
    return {
      platform: this.platform,
      remoteId,
      url: `https://instagram.com/p/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }
}
