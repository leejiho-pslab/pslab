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
 * Threads 플러그인 (Threads API by Meta).
 *
 * 실제 연동: Instagram과 유사한 2단계 — threads media container 생성 후 publish.
 * 필요한 자격 증명: accessToken, threadsUserId.
 */
export class ThreadsPlugin extends BasePlugin {
  readonly platform: PlatformId = 'threads';
  readonly displayName = 'Threads';

  /** Threads 텍스트 글자 수 한계 */
  private static readonly TEXT_LIMIT = 500;

  protected requiredCredentials(): string[] {
    return ['accessToken', 'threadsUserId'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    return simulateApiCall(`Threads 계정(${creds.threadsUserId})`);
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    // Threads는 본문 + 해시태그가 한 글자수 예산을 공유한다.
    const tagText = (content.tags ?? []).map((t) => `#${t}`).join(' ');
    const total = content.body.length + (tagText ? tagText.length + 1 : 0);
    if (total > ThreadsPlugin.TEXT_LIMIT) {
      errors.push(
        `본문+해시태그 합계는 ${ThreadsPlugin.TEXT_LIMIT}자 이하여야 합니다 (현재 ${total}자).`,
      );
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    this.log.info(`스레드 발행 (${content.body.length}자)`);

    // 실제 1단계: POST /{threads-user-id}/threads (text/media) → creation_id
    const creationId = await simulateApiCall(
      `thc_${Math.random().toString(36).slice(2, 10)}`,
    );
    // 실제 2단계: POST /{threads-user-id}/threads_publish?creation_id=...
    const remoteId = await simulateApiCall(
      `th_${creationId.slice(4)}${Math.random().toString(36).slice(2, 5)}`,
    );
    return {
      platform: this.platform,
      ok: true,
      remoteId,
      url: `https://threads.net/t/${remoteId}`,
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // 실제: GET /{threads-media-id}/insights?metric=views,likes,replies,reposts
    const metrics = await simulateApiCall(pseudoMetrics(`th:${remoteId}`));
    return {
      platform: this.platform,
      remoteId,
      url: `https://threads.net/t/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }
}
