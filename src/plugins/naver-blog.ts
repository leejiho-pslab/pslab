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
    this.log.info(`블로그 포스팅: "${content.title}"`);

    // 실제: 네이버 블로그 글쓰기 API 호출 (제목, 본문 HTML, 태그, 첨부)
    const remoteId = await simulateApiCall(
      `nb_${Math.random().toString(36).slice(2, 11)}`,
    );
    const blogId = this.credentials.blogId ?? 'my-blog';
    return {
      platform: this.platform,
      ok: true,
      remoteId,
      url: `https://blog.naver.com/${blogId}/${remoteId}`,
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
