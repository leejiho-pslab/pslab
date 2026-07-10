import { BasePlugin } from '../core/plugin.js';
import type {
  AnalyticsReport,
  PlatformId,
  PluginCredentials,
  PostContent,
  PublishResult,
} from '../core/types.js';
import { simulateApiCall, timedFetch } from './shared.js';

/**
 * 구글 블로그(Blogger) 플러그인 — Blogger API v3 공식 자동발행.
 *
 * 발행: POST /blogs/{blogId}/posts (OAuth2 Bearer 토큰).
 * 자격 증명: clientId, clientSecret, refreshToken, blogId.
 *  - refreshToken으로 매 실행마다 access token을 발급(만료 ~1시간).
 * dryRun=true면 실제 호출 없이 시뮬레이션.
 *
 * 네이버 블로그는 공식 글쓰기 API가 없어 수동이지만, Blogger는 API로
 * 자동 발행이 가능하다.
 */
export class BloggerPlugin extends BasePlugin {
  readonly platform: PlatformId = 'blogger';
  readonly displayName = '구글 블로그(Blogger)';

  private static readonly API = 'https://www.googleapis.com/blogger/v3';
  private static readonly TOKEN = 'https://oauth2.googleapis.com/token';
  private accessToken?: string;

  protected requiredCredentials(): string[] {
    return ['clientId', 'clientSecret', 'refreshToken', 'blogId'];
  }

  protected async authenticate(creds: PluginCredentials): Promise<string> {
    if (this.ctx.dryRun) {
      return simulateApiCall(`Blogger(${creds.blogId})`);
    }
    await this.refreshAccessToken();
    const blog = await this.apiGet(`blogs/${creds.blogId}`, { fields: 'name,url' });
    return blog.name ? `${blog.name}` : `Blogger(${creds.blogId})`;
  }

  override validate(content: PostContent): string[] {
    const errors = super.validate(content);
    if (!content.title) {
      errors.push('Blogger 글에는 제목(title)이 필요합니다.');
    }
    return errors;
  }

  async publish(content: PostContent): Promise<PublishResult> {
    this.ensureConnected();
    this.log.info(`Blogger 발행: "${content.title}"`);

    if (this.ctx.dryRun) {
      const remoteId = await simulateApiCall(
        `bg_${Math.random().toString(36).slice(2, 11)}`,
      );
      return {
        platform: this.platform,
        ok: true,
        remoteId,
        url: `https://example.blogspot.com/${remoteId}`,
        publishedAt: this.now(),
      };
    }

    if (!this.accessToken) await this.refreshAccessToken();
    const blogId = this.credentials.blogId!;
    const html = markdownToHtml(content.body, content.title);
    const labels = (content.tags ?? []).slice(0, 20);
    const post = await this.apiPost(`blogs/${blogId}/posts`, {
      kind: 'blogger#post',
      title: content.title,
      content: html,
      ...(labels.length ? { labels } : {}),
    });
    return {
      platform: this.platform,
      ok: true,
      remoteId: String(post.id),
      url: post.url ?? `https://www.blogger.com/`,
      publishedAt: this.now(),
    };
  }

  async fetchAnalytics(remoteId: string): Promise<AnalyticsReport> {
    this.ensureConnected();
    // Blogger API는 글 단위 조회수를 제공하지 않는다(블로그 전체 pageviews만).
    // 학습 루프에 영향이 없도록 0 지표를 반환한다.
    return {
      platform: this.platform,
      remoteId,
      url: `https://www.blogger.com/`,
      metrics: { views: 0, likes: 0, comments: 0, shares: 0, engagementRate: 0 },
      collectedAt: this.now(),
    };
  }

  /** refresh token으로 access token을 발급해 보관한다. */
  private async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId!,
      client_secret: this.credentials.clientSecret!,
      refresh_token: this.credentials.refreshToken!,
      grant_type: 'refresh_token',
    });
    const res = await timedFetch(BloggerPlugin.TOKEN, { method: 'POST', body });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || !json.access_token) {
      throw new Error(
        `Blogger 토큰 갱신 실패: ${json.error_description ?? json.error ?? res.status}`,
      );
    }
    this.accessToken = json.access_token;
  }

  private async apiGet(path: string, params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams(params);
    const res = await timedFetch(`${BloggerPlugin.API}/${path}?${qs.toString()}`, {
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Blogger API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }

  private async apiPost(path: string, body: unknown): Promise<any> {
    const res = await timedFetch(`${BloggerPlugin.API}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Blogger API: ${json.error?.message ?? res.status}`);
    }
    return json;
  }
}

/**
 * 우리 캡션 본문(가벼운 마크다운)을 Blogger용 HTML로 변환한다.
 * 지원: # / ## 소제목, > 인용, **굵게**, 🔖 태그, 빈 줄=문단.
 * 맨 앞의 "# 제목" 줄은 title로 따로 쓰므로 본문에서 제거한다.
 */
export function markdownToHtml(body: string, title?: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  const lines = body.split('\n');
  // 맨 앞 "# 제목" 이 title과 같으면 제거
  if (lines.length && /^#\s+/.test(lines[0].trim())) {
    const h = lines[0].trim().replace(/^#\s+/, '');
    if (!title || h.trim() === title.trim()) lines.shift();
  }

  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br/>')}</p>`);
      para = [];
    }
  };
  for (const raw of lines) {
    const t = raw.trim();
    const img = t.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (t === '') {
      flush();
    } else if (img) {
      flush();
      out.push(
        `<p><img src="${img[2]}" alt="${esc(img[1])}" style="max-width:100%;height:auto;border-radius:8px"/></p>`,
      );
    } else if (t.startsWith('## ')) {
      flush();
      out.push(`<h2>${inline(t.slice(3))}</h2>`);
    } else if (t.startsWith('# ')) {
      flush();
      out.push(`<h2>${inline(t.slice(2))}</h2>`);
    } else if (t === '>' || t.startsWith('> ')) {
      flush();
      out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (t.startsWith('🔖')) {
      flush();
      out.push(`<p>${inline(t)}</p>`);
    } else if (/^[-*]\s+/.test(t)) {
      para.push('• ' + t.replace(/^[-*]\s+/, ''));
    } else {
      para.push(t);
    }
  }
  flush();
  return out.join('\n');
}
