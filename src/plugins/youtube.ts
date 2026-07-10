import { existsSync, readFileSync } from 'node:fs';
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
 * YouTube 플러그인 (YouTube Data API v3, 재개형 업로드).
 *
 * 발행: POST /upload/youtube/v3/videos (resumable) — 시작 요청으로 업로드 URL을 받고
 * 그 URL에 영상 바이트를 PUT. 자격 증명: clientId, clientSecret, refreshToken (+ channelId 표시용).
 * media(kind:'video').source는 로컬 파일 경로(CI 작업 디렉터리 기준)를 기대한다.
 * dryRun=true면 실제 호출 없이 시뮬레이션.
 *
 * 주의(구글 정책): 앱을 구글 심사(검수)받지 않으면 OAuth 동의 화면이 "테스트" 상태로 남아
 * refresh token이 7일마다 만료된다 — 그럴 땐 담당자가 OAuth Playground 등에서 다시 발급해야
 * 무인 업로드가 이어진다. 심사를 받으면 만료 없이 계속 동작한다.
 */
export class YouTubePlugin extends BasePlugin {
  readonly platform: PlatformId = 'youtube';
  readonly displayName = 'YouTube';

  private static readonly TOKEN = 'https://oauth2.googleapis.com/token';
  private static readonly UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
  private static readonly API = 'https://www.googleapis.com/youtube/v3';
  /** 기본 카테고리: 22 = People & Blogs */
  private static readonly DEFAULT_CATEGORY_ID = '22';
  private accessToken?: string;

  protected requiredCredentials(): string[] {
    return ['clientId', 'clientSecret', 'refreshToken'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    if (this.ctx.dryRun) {
      return simulateApiCall(`YouTube 채널(${creds.channelId ?? 'my-channel'})`);
    }
    await this.refreshAccessToken();
    try {
      const json = await this.apiGet('channels', { part: 'snippet', mine: 'true' });
      const title = json.items?.[0]?.snippet?.title;
      return title ?? `YouTube(${creds.channelId ?? 'channel'})`;
    } catch {
      return `YouTube(${creds.channelId ?? 'channel'})`;
    }
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
    this.log.info(`쇼츠 업로드: "${content.title}"`);

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

    if (!video) {
      return {
        platform: this.platform,
        ok: false,
        error: '업로드할 영상 파일이 아직 준비되지 않았습니다 (다음 자동 발행 주기에 재시도).',
        publishedAt: this.now(),
      };
    }
    if (!existsSync(video.source)) {
      return {
        platform: this.platform,
        ok: false,
        error: `영상 파일을 찾을 수 없습니다: ${video.source}`,
        publishedAt: this.now(),
      };
    }

    if (!this.accessToken) await this.refreshAccessToken();
    const bytes = readFileSync(video.source);
    const tags = (content.tags ?? []).slice(0, 15);
    // 공개 범위 — 기본은 반드시 '전체 공개'. (일부공개로 올라가는 사고 방지)
    // 테스트 등으로 낮추고 싶을 때만 platformOptions 또는 PSLAB_YOUTUBE_PRIVACY로 재정의.
    const privacyStatus =
      (content.platformOptions?.youtube?.privacyStatus as string) ??
      process.env.PSLAB_YOUTUBE_PRIVACY ??
      'public';

    // 1단계: 재개형 업로드 시작 — 메타데이터를 보내고 실제 업로드 URL을 받는다.
    const initRes = await timedFetch(`${YouTubePlugin.UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
        'x-upload-content-type': 'video/mp4',
        'x-upload-content-length': String(bytes.length),
      },
      body: JSON.stringify({
        snippet: {
          title: content.title!.slice(0, 100),
          description: content.body.slice(0, 5000),
          tags,
          categoryId: YouTubePlugin.DEFAULT_CATEGORY_ID,
        },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
    });
    if (!initRes.ok) {
      const errJson: any = await initRes.json().catch(() => ({}));
      throw new Error(`YouTube 업로드 시작 실패: ${errJson.error?.message ?? initRes.status}`);
    }
    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) {
      throw new Error('YouTube 업로드 URL을 응답에서 받지 못했습니다.');
    }

    // 2단계: 실제 영상 바이트 업로드
    const putRes = await timedFetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
      body: bytes,
    }, 600_000); // 영상 업로드는 10분까지 허용
    const json: any = await putRes.json().catch(() => ({}));
    if (!putRes.ok || !json.id) {
      throw new Error(`YouTube 업로드 실패: ${json.error?.message ?? putRes.status}`);
    }

    return {
      platform: this.platform,
      ok: true,
      remoteId: String(json.id),
      url: `https://youtu.be/${json.id}`,
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // YouTube Analytics API는 별도 OAuth 스코프·연동이 필요해 우선 의사 지표로 채운다.
    const metrics = await simulateApiCall(pseudoMetrics(`yt:${remoteId}`));
    return {
      platform: this.platform,
      remoteId,
      url: `https://youtu.be/${remoteId}`,
      metrics,
      collectedAt: this.now(),
    };
  }

  /** refresh token으로 access token을 발급해 보관한다 (구글 OAuth2, Blogger와 동일 패턴). */
  private async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId!,
      client_secret: this.credentials.clientSecret!,
      refresh_token: this.credentials.refreshToken!,
      grant_type: 'refresh_token',
    });
    const res = await timedFetch(YouTubePlugin.TOKEN, { method: 'POST', body });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new Error(
        `YouTube 토큰 갱신 실패: ${json.error_description ?? json.error ?? res.status}`,
      );
    }
    this.accessToken = json.access_token;
  }

  private async apiGet(path: string, params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params);
    const res = await timedFetch(`${YouTubePlugin.API}/${path}?${qs.toString()}`, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`YouTube API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }
}
