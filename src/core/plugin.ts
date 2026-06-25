import type {
  AnalyticsReport,
  ConnectionStatus,
  PlatformId,
  PluginCredentials,
  PostContent,
  PublishResult,
} from './types.js';
import { createLogger, type Logger } from './logger.js';

/**
 * 모든 SNS 플러그인이 구현해야 하는 계약.
 *
 * 레지스트리는 이 인터페이스만 의존하므로, 새 플랫폼을 추가하려면
 * 이 인터페이스를 구현하는 클래스를 하나 더 만들어 등록하면 된다.
 */
export interface SnsPlugin {
  /** 플랫폼 식별자 */
  readonly platform: PlatformId;
  /** 사람이 읽는 표시 이름 */
  readonly displayName: string;

  /**
   * 자격 증명으로 플랫폼에 연결(인증)한다.
   * 성공/실패 여부와 연결된 계정 정보를 반환한다.
   */
  connect(credentials: PluginCredentials): Promise<ConnectionStatus>;

  /** 현재 연결 상태 */
  isConnected(): boolean;

  /**
   * 플랫폼 독립적 콘텐츠를 받아 실제로 발행한다.
   * 플러그인 내부에서 자기 플랫폼 형식으로 변환한다.
   */
  publish(content: PostContent): Promise<PublishResult>;

  /** 발행된 게시물의 성과 지표를 수집한다. */
  fetchAnalytics(remoteId: string): Promise<AnalyticsReport>;

  /**
   * 콘텐츠가 이 플랫폼 제약(글자 수, 미디어 필수 여부 등)에 맞는지 검증한다.
   * 문제가 없으면 빈 배열을 반환한다.
   */
  validate(content: PostContent): string[];
}

/** 플러그인 생성 시 주입되는 옵션 */
export interface PluginContext {
  /** 드라이런: 실제 API 호출 없이 동작만 시뮬레이션 */
  dryRun: boolean;
}

/**
 * 공통 로직(로깅, 연결 상태 관리, 기본 검증)을 제공하는 베이스 클래스.
 * 각 플랫폼 플러그인은 이 클래스를 확장한다.
 */
export abstract class BasePlugin implements SnsPlugin {
  abstract readonly platform: PlatformId;
  abstract readonly displayName: string;

  protected readonly log: Logger;
  protected readonly ctx: PluginContext;
  protected credentials: PluginCredentials = {};
  private connected = false;
  protected account?: string;

  constructor(ctx: PluginContext) {
    this.ctx = ctx;
    this.log = createLogger(`plugin:${this.constructor.name}`);
  }

  /** 연결에 반드시 필요한 자격 증명 키 목록 */
  protected abstract requiredCredentials(): string[];

  /** 플랫폼별 실제 인증 로직. 성공 시 계정 표시 이름을 반환한다. */
  protected abstract authenticate(
    credentials: PluginCredentials,
  ): Promise<string>;

  async connect(credentials: PluginCredentials): Promise<ConnectionStatus> {
    const missing = this.requiredCredentials().filter((k) => !credentials[k]);
    if (missing.length > 0) {
      const detail = `자격 증명 누락: ${missing.join(', ')}`;
      this.log.warn(`${this.displayName} 연결 실패 — ${detail}`);
      return { platform: this.platform, connected: false, detail };
    }

    this.credentials = credentials;
    try {
      this.account = await this.authenticate(credentials);
      this.connected = true;
      this.log.info(`${this.displayName} 연결됨 → ${this.account}`);
      return {
        platform: this.platform,
        connected: true,
        account: this.account,
      };
    } catch (err) {
      this.connected = false;
      const detail = err instanceof Error ? err.message : String(err);
      this.log.error(`${this.displayName} 인증 오류 — ${detail}`);
      return { platform: this.platform, connected: false, detail };
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  abstract publish(content: PostContent): Promise<PublishResult>;
  abstract fetchAnalytics(remoteId: string): Promise<AnalyticsReport>;

  /** 모든 플랫폼 공통 기본 검증. 하위 클래스에서 super.validate()로 합칠 수 있다. */
  validate(content: PostContent): string[] {
    const errors: string[] = [];
    if (!content.body || content.body.trim().length === 0) {
      errors.push('본문(body)이 비어 있습니다.');
    }
    return errors;
  }

  /** 발행 직전 연결 상태를 보장한다. */
  protected ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`${this.displayName}: 먼저 connect()로 연결해야 합니다.`);
    }
  }

  /** 드라이런/실제 발행 분기를 위한 헬퍼 */
  protected now(): string {
    return new Date().toISOString();
  }
}
