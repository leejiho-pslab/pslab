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
 * 네이버 블로그 플러그인.
 *
 * 실제 연동: 네이버 블로그 글쓰기 오픈 API (XML-RPC/REST) 또는
 * 네이버 검색 광고/데이터랩과 결합. OAuth2 access token 사용.
 * 필요한 자격 증명: clientId, clientSecret, accessToken.
 */
export class NaverBlogPlugin extends BasePlugin {
  readonly platform: PlatformId = 'naver-blog';
  readonly displayName = '네이버 블로그';

  protected requiredCredentials(): string[] {
    return ['clientId', 'clientSecret', 'accessToken'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    const blogId = creds.blogId ?? 'my-blog';
    return simulateApiCall(`네이버 블로그(${blogId})`);
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    if (!content.title) {
      errors.push('블로그 글에는 제목(title)이 필요합니다.');
    } else if (content.title.length > 100) {
      errors.push('제목은 100자 이하를 권장합니다.');
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    this.log.info(`블로그 포스팅(수동 채널): "${content.title}"`);

    // 네이버 블로그는 공식 자동발행 API가 없다(글쓰기 오픈 API 종료).
    // 자동 발행을 흉내내 "성공"이라 보고하면 사용자를 속이게 되므로,
    // 여기서는 명확히 실패(수동 발행 필요)로 반환한다.
    // 실제 발행은 대시보드에서 완성된 글을 복사해 직접 올린다.
    if (this.ctx.dryRun) {
      const remoteId = await simulateApiCall(
        `nb_dry_${Math.random().toString(36).slice(2, 9)}`,
      );
      return {
        platform: this.platform,
        ok: true,
        remoteId,
        url: `https://blog.naver.com/preview/${remoteId}`,
        publishedAt: this.now(),
      };
    }
    return {
      platform: this.platform,
      ok: false,
      error:
        '네이버 블로그는 자동 발행 API가 없는 수동 채널입니다. 대시보드에서 완성된 글을 복사해 직접 게시하세요.',
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // 실제: 네이버 블로그 통계 + 데이터랩 유입 분석
    const metrics = await simulateApiCall(pseudoMetrics(`nb:${remoteId}`));
    const blogId = this.credentials.blogId ?? 'my-blog';
    return {
      platform: this.platform,
      remoteId,
      url: `https://blog.naver.com/${blogId}/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }
}
