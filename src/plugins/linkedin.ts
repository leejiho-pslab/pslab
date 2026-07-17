import { BasePlugin } from '../core/plugin.js';
import type {
  AnalyticsReport,
  PlatformId,
  PluginCredentials,
  PostContent,
  PublishResult,
} from '../core/types.js';
import { pseudoMetrics, simulateApiCall, timedFetch } from './shared.js';

/**
 * LinkedIn 플러그인 (LinkedIn Posts API, REST).
 *
 * 발행: POST /rest/posts (author=urn:li:person|organization).
 * 이미지가 있으면 Images API로 먼저 업로드(initializeUpload → PUT → urn)한 뒤 게시물에 첨부.
 * 필요한 자격 증명: accessToken, authorUrn.
 * dryRun=true면 실제 호출 없이 시뮬레이션.
 */
export class LinkedInPlugin extends BasePlugin {
  readonly platform: PlatformId = 'linkedin';
  readonly displayName = 'LinkedIn';

  private static readonly API = 'https://api.linkedin.com/rest';
  /** LinkedIn REST API 버전 헤더 (YYYYMM). LinkedIn이 주기적으로 구버전을 폐기하니 갱신 필요. */
  private static readonly API_VERSION = '202411';
  /** LinkedIn 게시물 글자 수 한계 */
  private static readonly TEXT_LIMIT = 3000;

  protected requiredCredentials(): string[] {
    return ['accessToken', 'authorUrn'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    if (this.ctx.dryRun) {
      return simulateApiCall(`LinkedIn(${creds.authorUrn})`);
    }
    if (!/^urn:li:(person|organization):/.test(creds.authorUrn ?? '')) {
      throw new Error(
        'authorUrn 형식이 올바르지 않습니다 (urn:li:person:... 또는 urn:li:organization:...).',
      );
    }
    return creds.authorUrn!;
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
    const image = content.media?.find((m) => m.kind === 'image');
    const text = content.body.slice(0, LinkedInPlugin.TEXT_LIMIT);
    this.log.info(
      `게시물 발행 (작성자: ${this.credentials.authorUrn}, ${text.length}자${image ? '+이미지' : ''})`,
    );

    if (this.ctx.dryRun) {
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

    // --- 실제 발행 ---
    const author = this.credentials.authorUrn!;
    const media = image ? { id: await this.uploadImage(author, image.source) } : undefined;

    const body: Record<string, unknown> = {
      author,
      commentary: text,
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
      ...(media ? { content: { media } } : {}),
    };

    const res = await timedFetch(`${LinkedInPlugin.API}/posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errJson: any = await res.json().catch(() => ({}));
      throw new Error(`LinkedIn API: ${errJson.message ?? res.status}`);
    }
    const remoteId = res.headers.get('x-restli-id') ?? res.headers.get('x-linkedin-id');
    if (!remoteId) {
      throw new Error('LinkedIn API: 응답에서 게시물 ID를 찾지 못했습니다.');
    }

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
    // LinkedIn 소셜 지표 API는 조직 페이지·파트너 승인이 별도로 필요해 우선 의사 지표로 채운다.
    const metrics = await simulateApiCall(pseudoMetrics(`li:${remoteId}`));
    return {
      platform: this.platform,
      remoteId,
      url: `https://www.linkedin.com/feed/update/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.credentials.accessToken}`,
      'content-type': 'application/json',
      'linkedin-version': LinkedInPlugin.API_VERSION,
      'x-restli-protocol-version': '2.0.0',
    };
  }

  /** 공개 URL의 이미지를 내려받아 LinkedIn Images API로 업로드하고 자산 urn을 반환한다. */
  private async uploadImage(author: string, publicUrl: string): Promise<string> {
    const initRes = await timedFetch(`${LinkedInPlugin.API}/images?action=initializeUpload`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
    });
    const initJson: any = await initRes.json().catch(() => ({}));
    if (!initRes.ok || !initJson.value) {
      throw new Error(`LinkedIn 이미지 업로드 시작 실패: ${initJson.message ?? initRes.status}`);
    }
    const { uploadUrl, image } = initJson.value;

    const imgRes = await timedFetch(publicUrl);
    if (!imgRes.ok) {
      throw new Error(`이미지 원본을 가져오지 못했습니다: ${publicUrl}`);
    }
    const bytes = Buffer.from(await imgRes.arrayBuffer());

    const putRes = await timedFetch(uploadUrl, {
      method: 'PUT',
      headers: { authorization: `Bearer ${this.credentials.accessToken}` },
      body: bytes,
    });
    if (!putRes.ok) {
      throw new Error(`LinkedIn 이미지 업로드 실패: ${putRes.status}`);
    }
    return image as string;
  }
}
