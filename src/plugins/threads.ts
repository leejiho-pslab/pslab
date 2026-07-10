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
 * Threads 플러그인 (Threads API by Meta — graph.threads.net).
 *
 * 2단계 발행: 미디어 컨테이너 생성(/threads) → 발행(/threads_publish).
 *  - 텍스트 글: media_type=TEXT
 *  - 이미지+텍스트: media_type=IMAGE + image_url(공개 URL)
 * dryRun=true면 실제 호출 없이 시뮬레이션.
 * 필요한 자격 증명: accessToken, threadsUserId.
 */
export class ThreadsPlugin extends BasePlugin {
  readonly platform: PlatformId = 'threads';
  readonly displayName = 'Threads';

  private static readonly API = 'https://graph.threads.net/v1.0';
  /** Threads 텍스트 글자 수 한계 */
  private static readonly TEXT_LIMIT = 500;

  protected requiredCredentials(): string[] {
    return ['accessToken', 'threadsUserId'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    if (this.ctx.dryRun) {
      return simulateApiCall(`Threads 계정(${creds.threadsUserId})`);
    }
    // Threads는 본인 노드를 'me'로 조회한다 (숫자 ID 직접 조회는 미지원).
    const json = await this.apiGet('me', { fields: 'username' });
    return `@${json.username ?? creds.threadsUserId}`;
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    // 자르기 전 원본 길이로 검증 (buildText는 발행용으로 잘라내므로 쓰지 않는다)
    const tags = (content.tags ?? []).map((t) => `#${t}`).join(' ');
    const raw = [content.body, tags].filter(Boolean).join('\n\n');
    if (raw.length > ThreadsPlugin.TEXT_LIMIT) {
      errors.push(
        `본문+해시태그 합계는 ${ThreadsPlugin.TEXT_LIMIT}자 이하여야 합니다 (현재 ${raw.length}자).`,
      );
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    const image = content.media?.find((m) => m.kind === 'image');
    const text = this.buildText(content);
    this.log.info(
      image ? `스레드 발행 (이미지+${text.length}자)` : `스레드 발행 (${text.length}자)`,
    );

    if (this.ctx.dryRun) {
      const remoteId = await simulateApiCall(
        `th_${Math.random().toString(36).slice(2, 10)}`,
      );
      return {
        platform: this.platform,
        ok: true,
        remoteId,
        url: `https://threads.net/t/${remoteId}`,
        publishedAt: this.now(),
      };
    }

    // --- 실제 발행 (본인 노드는 'me'로) ---
    if (image && !/^https?:\/\//.test(image.source)) {
      throw new Error(
        `Threads 이미지 발행에는 공개 http(s) URL이 필요합니다 (현재: ${image.source}).`,
      );
    }

    // 1단계: 컨테이너 생성
    const params: Record<string, string> = { text };
    if (image) {
      params.media_type = 'IMAGE';
      params.image_url = image.source;
    } else {
      params.media_type = 'TEXT';
    }
    const created = await this.apiPost('me/threads', params);
    const creationId = String(created.id);

    // 미디어는 처리 완료까지 잠깐 대기 (텍스트는 즉시)
    if (image) {
      await this.waitForContainerReady(creationId);
    }

    // 2단계: 발행
    const published = await this.apiPost('me/threads_publish', {
      creation_id: creationId,
    });
    const remoteId = String(published.id);

    let url = 'https://www.threads.net/';
    try {
      const info = await this.apiGet(`${remoteId}`, { fields: 'permalink' });
      if (info.permalink) url = info.permalink;
    } catch {
      /* permalink 실패해도 발행은 성공 */
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
      const metrics = await simulateApiCall(pseudoMetrics(`th:${remoteId}`));
      return {
        platform: this.platform,
        remoteId,
        url: `https://threads.net/t/${remoteId}`,
        metrics,
        collectedAt: this.now(),
      };
    }
    let views = 0,
      likes = 0,
      replies = 0,
      reposts = 0;
    try {
      const ins = await this.apiGet(`${remoteId}/insights`, {
        metric: 'views,likes,replies,reposts',
      });
      for (const d of ins.data ?? []) {
        const v = d.values?.[0]?.value ?? d.total_value?.value ?? 0;
        if (d.name === 'views') views = v;
        else if (d.name === 'likes') likes = v;
        else if (d.name === 'replies') replies = v;
        else if (d.name === 'reposts') reposts = v;
      }
    } catch {
      /* insights 미지원 — 무시 */
    }
    const metrics: AnalyticsMetrics = {
      views,
      likes,
      comments: replies,
      shares: reposts,
      engagementRate: views > 0 ? (likes + replies + reposts) / views : 0,
    };
    return {
      platform: this.platform,
      remoteId,
      url: `https://www.threads.net/`,
      metrics,
      collectedAt: this.now(),
    };
  }

  /** 본문 + 해시태그를 합쳐 글자수 한계로 자른다. */
  private buildText(content: PostContent): string {
    const tags = (content.tags ?? []).map((t) => `#${t}`).join(' ');
    return [content.body, tags]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, ThreadsPlugin.TEXT_LIMIT);
  }

  /** 이미지 컨테이너가 발행 가능(FINISHED) 상태가 될 때까지 폴링. */
  private async waitForContainerReady(
    creationId: string,
    maxTries = 12,
    delayMs = 3000,
  ): Promise<void> {
    for (let i = 0; i < maxTries; i++) {
      const s = await this.apiGet(`${creationId}`, { fields: 'status' });
      const status = s.status ?? s.status_code;
      if (status === 'FINISHED' || status === 'PUBLISHED') return;
      if (status === 'ERROR') throw new Error('Threads 미디어 처리 실패(ERROR).');
      await new Promise((r) => setTimeout(r, delayMs));
    }
    // 시간 초과해도 발행을 시도해 본다 (텍스트형은 즉시 가능)
  }

  private async apiGet(
    path: string,
    params: Record<string, string>,
  ): Promise<any> {
    const qs = new URLSearchParams({
      ...params,
      access_token: this.credentials.accessToken!,
    });
    const res = await timedFetch(`${ThreadsPlugin.API}/${path}?${qs.toString()}`);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Threads API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }

  private async apiPost(
    path: string,
    params: Record<string, string>,
  ): Promise<any> {
    const body = new URLSearchParams({
      ...params,
      access_token: this.credentials.accessToken!,
    });
    const res = await timedFetch(`${ThreadsPlugin.API}/${path}`, {
      method: 'POST',
      body,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Threads API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }
}
