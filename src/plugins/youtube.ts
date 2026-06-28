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
 * YouTube 플러그인 (YouTube Data API v3 커뮤니티/동영상 업로드 대응).
 *
 * 실제 연동: googleapis 패키지의 youtube.videos.insert 사용.
 * 필요한 자격 증명: OAuth2 client/secret + refresh token, channelId.
 */
export class YouTubePlugin extends BasePlugin {
  readonly platform: PlatformId = 'youtube';
  readonly displayName = 'YouTube';

  protected requiredCredentials(): string[] {
    return ['clientId', 'clientSecret', 'refreshToken'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    // 실제: OAuth2 토큰 교환 → channels.list(mine=true)로 채널명 조회
    const channel = creds.channelId ?? 'my-channel';
    return simulateApiCall(`YouTube 채널(${channel})`);
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    if (!content.title) {
      errors.push('YouTube는 영상 제목(title)이 필요합니다.');
    } else if (content.title.length > 100) {
      errors.push('제목은 100자 이하여야 합니다.');
    }
    const hasVideo = content.media?.some((m) => m.kind === 'video');
    if (!hasVideo) {
      errors.push('업로드할 동영상(media: video)이 필요합니다.');
    }
    if (content.body.length > 5000) {
      errors.push('설명(body)은 5000자 이하여야 합니다.');
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    const video = content.media?.find((m) => m.kind === 'video');
    this.log.info(`쇼츠 대본(수동 채널): "${content.title}"`);

    // 유튜브 업로드는 실제 "영상 파일"이 필요하다(우리는 대본만 생성).
    // 영상 없이 "성공"이라 보고하면 거짓이므로, 수동 발행 필요로 반환한다.
    if (this.ctx.dryRun) {
      const remoteId = await simulateApiCall(
        `yt_dry_${Math.random().toString(36).slice(2, 11)}`,
      );
      return {
        platform: this.platform,
        ok: true,
        remoteId,
        url: `https://youtu.be/${remoteId}`,
        publishedAt: this.now(),
      };
    }
    return {
      platform: this.platform,
      ok: false,
      error: video
        ? '유튜브 업로드는 OAuth 영상 업로드 연동이 필요한 수동 채널입니다. 대본으로 영상 제작 후 직접 업로드하세요.'
        : '유튜브는 영상 파일이 필요합니다. pslab은 쇼츠 대본만 생성합니다 — 대본으로 영상을 만든 뒤 직접 업로드하세요.',
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // 실제: YouTube Analytics API (views, likes, comments, shares)
    const metrics = await simulateApiCall(pseudoMetrics(`yt:${remoteId}`));
    return {
      platform: this.platform,
      remoteId,
      url: `https://youtu.be/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }
}
