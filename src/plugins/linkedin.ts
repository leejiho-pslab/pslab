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
 * LinkedIn 플러그인 (LinkedIn Marketing/Posts API).
 *
 * 실제 연동: POST /rest/posts (author=urn:li:person|organization).
 * 필요한 자격 증명: accessToken, authorUrn.
 */
export class LinkedInPlugin extends BasePlugin {
  readonly platform: PlatformId = 'linkedin';
  readonly displayName = 'LinkedIn';

  /** LinkedIn 본문 글자 수 한계 */
  private static readonly TEXT_LIMIT = 3000;

  protected requiredCredentials(): string[] {
    return ['accessToken', 'authorUrn'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    return simulateApiCall(`LinkedIn(${creds.authorUrn})`);
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    if (content.body.length > LinkedInPlugin.TEXT_LIMIT) {
      errors.push(`본문은 ${LinkedInPlugin.TEXT_LIMIT}자 이하여야 합니다.`);
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    this.log.info(
      `게시물 발행 (작성자: ${this.credentials.authorUrn}, ${content.body.length}자)`,
    );

    // 실제: POST https://api.linkedin.com/rest/posts
    const remoteId = await simulateApiCall(
      `urn:li:share:${Date.now()}${Math.floor(Math.random() * 1000)}`,
    );
    return {
      platform: this.platform,
      ok: true,
      remoteId,
      url: `https://www.linkedin.com/feed/update/${remoteId}`,
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // 실제: GET /rest/socialActions/{share-urn} + organizationalEntityShareStatistics
    const metrics = await simulateApiCall(pseudoMetrics(`li:${remoteId}`));
    return {
      platform: this.platform,
      remoteId,
      url: `https://www.linkedin.com/feed/update/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }
}
