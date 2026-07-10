import { BasePlugin } from '../core/plugin.js';
import type {
  AnalyticsReport,
  AnalyticsMetrics,
  PlatformId,
  PluginCredentials,
  PostContent,
  PublishResult,
} from '../core/types.js';
import { pseudoMetrics, simulateApiCall, timedFetch } from './shared.js';

/**
 * Instagram 플러그인 (Instagram Graph API).
 *
 * 2단계 발행: media container 생성 → media_publish.
 * - dryRun=true: 실제 호출 없이 시뮬레이션 (개발/리허설)
 * - dryRun=false: 실제 Graph API 호출 (운영)
 *
 * 필요한 자격 증명: accessToken(장기), igUserId(비즈니스 계정 ID).
 * 주의: 실제 발행은 미디어가 **공개 http(s) URL** 이어야 합니다
 * (Instagram이 그 URL을 직접 가져갑니다).
 */
export class InstagramPlugin extends BasePlugin {
  readonly platform: PlatformId = 'instagram';
  readonly displayName = 'Instagram';

  private static readonly API = 'https://graph.facebook.com/v21.0';
  /** Instagram 캡션 권장 길이 한계 */
  private static readonly CAPTION_LIMIT = 2200;
  private static readonly HASHTAG_LIMIT = 30;

  protected requiredCredentials(): string[] {
    return ['accessToken', 'igUserId'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    if (this.ctx.dryRun) {
      return simulateApiCall(`Instagram 계정(${creds.igUserId})`);
    }
    // 실제: 토큰으로 계정 username 조회 (토큰·ID 유효성 검증)
    const json = await this.graphGet(`${creds.igUserId}`, { fields: 'username' });
    return `@${json.username}`;
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
    const images = (content.media ?? []).filter((m) => m.kind === 'image');
    const video = (content.media ?? []).find((m) => m.kind === 'video');
    const media = video ?? images[0];
    const isCarousel = !video && images.length > 1;
    const caption = this.buildCaption(content);
    this.log.info(
      isCarousel
        ? `캐러셀 발행 (${images.length}장)`
        : `피드 발행 (${media?.kind}: ${media?.source})`,
    );

    if (this.ctx.dryRun) {
      const creationId = await simulateApiCall(
        `igc_${Math.random().toString(36).slice(2, 10)}`,
      );
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

    // --- 실제 발행 ---
    const igUserId = this.credentials.igUserId!;
    if (!media) {
      throw new Error('발행할 미디어가 없습니다.');
    }
    for (const m of isCarousel ? images : [media]) {
      if (!/^https?:\/\//.test(m.source)) {
        throw new Error(
          `Instagram 실제 발행에는 공개 http(s) 미디어 URL이 필요합니다 (현재: ${m.source}).`,
        );
      }
    }

    let creationId: string;
    if (isCarousel) {
      // 캐러셀: 각 이미지를 자식 컨테이너로 만든 뒤, 부모 캐러셀 컨테이너로 묶는다.
      const childIds: string[] = [];
      for (const img of images.slice(0, 10)) {
        const child = await this.graphPost(`${igUserId}/media`, {
          image_url: img.source,
          is_carousel_item: 'true',
        });
        childIds.push(String(child.id));
      }
      const parent = await this.graphPost(`${igUserId}/media`, {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
      });
      creationId = String(parent.id);
    } else {
      // 단일 이미지/영상
      const params: Record<string, string> = { caption };
      if (media.kind === 'video') {
        params.media_type = 'REELS';
        params.video_url = media.source;
      } else {
        params.image_url = media.source;
      }
      const created = await this.graphPost(`${igUserId}/media`, params);
      creationId = String(created.id);
    }

    // 컨테이너가 FINISHED 상태가 될 때까지 대기 후 발행.
    // 이미지/캐러셀도 서버 측 처리가 비동기라, 곧바로 media_publish를 부르면
    // 드물게 "Media ID is not available" 오류가 난다(처리 완료 전 호출).
    await this.waitForContainerReady(creationId);

    // 2단계: 발행
    const published = await this.graphPost(`${igUserId}/media_publish`, {
      creation_id: creationId,
    });
    const remoteId = String(published.id);

    // 퍼머링크 조회 (실패해도 발행은 성공)
    let url = `https://instagram.com/`;
    try {
      const info = await this.graphGet(`${remoteId}`, { fields: 'permalink' });
      if (info.permalink) url = info.permalink;
    } catch {
      /* ignore */
    }

    return {
      platform: this.platform,
      ok: true,
      remoteId,
      url,
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();

    if (this.ctx.dryRun) {
      const metrics = await simulateApiCall(pseudoMetrics(`ig:${remoteId}`));
      return {
        platform: this.platform,
        remoteId,
        url: `https://instagram.com/p/${remoteId}`,
        metrics,
        collectedAt: this.now(),
      };
    }

    // 실제: 좋아요/댓글 + 도달(reach)
    const fields = await this.graphGet(`${remoteId}`, {
      fields: 'like_count,comments_count,permalink',
    });
    let reach = 0;
    try {
      const ins = await this.graphGet(`${remoteId}/insights`, { metric: 'reach' });
      reach =
        ins.data?.[0]?.values?.[0]?.value ??
        ins.data?.[0]?.total_value?.value ??
        0;
    } catch {
      /* insights 미지원 미디어 등 — 무시 */
    }
    const likes = Number(fields.like_count ?? 0);
    const comments = Number(fields.comments_count ?? 0);
    const metrics: AnalyticsMetrics = {
      views: reach,
      likes,
      comments,
      shares: 0,
      engagementRate: reach > 0 ? (likes + comments) / reach : 0,
    };
    return {
      platform: this.platform,
      remoteId,
      url: fields.permalink ?? `https://instagram.com/p/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }

  /** 본문 + 해시태그로 캡션을 만든다. */
  private buildCaption(content: PostContent): string {
    const tags = (content.tags ?? []).map((t) => `#${t}`).join(' ');
    return [content.body, tags]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, InstagramPlugin.CAPTION_LIMIT);
  }

  /** 미디어 컨테이너(이미지/캐러셀/영상)가 발행 가능 상태(FINISHED)가 될 때까지 폴링한다. */
  private async waitForContainerReady(
    creationId: string,
    maxTries = 15,
    delayMs = 3000,
  ): Promise<void> {
    for (let i = 0; i < maxTries; i++) {
      const s = await this.graphGet(`${creationId}`, { fields: 'status_code' });
      if (s.status_code === 'FINISHED') return;
      if (s.status_code === 'ERROR') {
        throw new Error('Instagram 영상 처리 실패(ERROR).');
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error('Instagram 영상 처리 대기 시간 초과.');
  }

  private async graphGet(
    path: string,
    params: Record<string, string>,
  ): Promise<any> {
    const qs = new URLSearchParams({
      ...params,
      access_token: this.credentials.accessToken!,
    });
    const res = await timedFetch(`${InstagramPlugin.API}/${path}?${qs.toString()}`);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Instagram API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }

  private async graphPost(
    path: string,
    params: Record<string, string>,
  ): Promise<any> {
    const body = new URLSearchParams({
      ...params,
      access_token: this.credentials.accessToken!,
    });
    const res = await timedFetch(`${InstagramPlugin.API}/${path}`, {
      method: 'POST',
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Instagram API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }
}
