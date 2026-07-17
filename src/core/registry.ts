import type { SnsPlugin } from './plugin.js';
import type {
  ConnectionStatus,
  PlatformId,
  PluginCredentials,
} from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('registry');

/**
 * 플러그인 레지스트리 — "플러그인 연결"의 중심.
 *
 * 플러그인을 등록(register)하고, 자격 증명으로 연결(connect)하며,
 * 발행/분석 단계에서 필요한 플러그인을 조회한다.
 */
export class PluginRegistry {
  private readonly plugins = new Map<PlatformId, SnsPlugin>();

  /** 플러그인을 등록한다. 같은 플랫폼이 이미 있으면 교체한다. */
  register(plugin: SnsPlugin): this {
    if (this.plugins.has(plugin.platform)) {
      log.warn(`${plugin.platform} 플러그인이 교체되었습니다.`);
    }
    this.plugins.set(plugin.platform, plugin);
    log.debug(`등록: ${plugin.displayName} (${plugin.platform})`);
    return this;
  }

  /** 여러 플러그인을 한 번에 등록한다. */
  registerAll(plugins: SnsPlugin[]): this {
    for (const p of plugins) this.register(p);
    return this;
  }

  /** 등록된 모든 플랫폼 ID */
  platforms(): PlatformId[] {
    return [...this.plugins.keys()];
  }

  /** 특정 플랫폼 플러그인을 가져온다. */
  get(platform: PlatformId): SnsPlugin {
    const plugin = this.plugins.get(platform);
    if (!plugin) {
      throw new Error(`등록되지 않은 플랫폼: ${platform}`);
    }
    return plugin;
  }

  /** 등록된 모든 플러그인 */
  all(): SnsPlugin[] {
    return [...this.plugins.values()];
  }

  /** 연결된 플러그인만 반환한다. */
  connected(): SnsPlugin[] {
    return this.all().filter((p) => p.isConnected());
  }

  /**
   * 자격 증명 맵으로 여러 플랫폼을 한 번에 연결한다.
   * 자격 증명이 없는 플랫폼은 건너뛴다.
   */
  async connectAll(
    credentialsByPlatform: Partial<Record<PlatformId, PluginCredentials>>,
  ): Promise<ConnectionStatus[]> {
    const results: ConnectionStatus[] = [];
    for (const plugin of this.all()) {
      const creds = credentialsByPlatform[plugin.platform];
      if (!creds) {
        log.debug(`${plugin.platform}: 자격 증명 없음 → 연결 건너뜀`);
        continue;
      }
      results.push(await plugin.connect(creds));
    }
    return results;
  }
}
