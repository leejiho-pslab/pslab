import type { PluginRegistry } from './registry.js';
import type { PlatformId, PostContent, PublishResult } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('publisher');

export interface PublishOptions {
  /** 발행 대상 플랫폼. 생략 시 연결된 모든 플랫폼에 발행한다. */
  targets?: PlatformId[];
  /** 검증 실패 시 해당 플랫폼만 건너뛸지(false) 전체를 중단할지(true) */
  failFast?: boolean;
}

export interface MultiPublishResult {
  contentId: string;
  results: PublishResult[];
  /** 모든 대상 발행이 성공했는지 */
  allOk: boolean;
}

/**
 * 멀티 채널 동시 발행 오케스트레이터.
 *
 * 하나의 PostContent를 여러 플러그인에 병렬로 발행하고,
 * 플랫폼별 결과를 모아 반환한다.
 */
export class Publisher {
  constructor(private readonly registry: PluginRegistry) {}

  async publish(
    content: PostContent,
    options: PublishOptions = {},
  ): Promise<MultiPublishResult> {
    const contentId = content.id ?? generateId();
    const withId: PostContent = { ...content, id: contentId };

    const targets = this.resolveTargets(options.targets);
    if (targets.length === 0) {
      throw new Error('발행 대상 플랫폼이 없습니다. 먼저 플러그인을 연결하세요.');
    }

    log.info(`발행 시작 [${contentId}] → ${targets.join(', ')}`);

    // 사전 검증
    const validationErrors = this.validateAll(withId, targets);
    if (options.failFast && validationErrors.length > 0) {
      throw new Error(
        `검증 실패로 발행 중단:\n${validationErrors.join('\n')}`,
      );
    }

    // 검증 통과한 플랫폼만 추린다.
    const failedPlatforms = new Set(
      validationErrors.map((e) => e.platform),
    );
    const publishable = targets.filter((t) => !failedPlatforms.has(t));

    // 병렬 발행
    const settled = await Promise.allSettled(
      publishable.map((platform) =>
        this.registry.get(platform).publish(withId),
      ),
    );

    const results: PublishResult[] = [];

    // 검증 실패 플랫폼은 실패 결과로 기록
    for (const ve of validationErrors) {
      results.push({
        platform: ve.platform,
        ok: false,
        error: ve.message,
        publishedAt: new Date().toISOString(),
      });
    }

    // 발행 결과 수집
    settled.forEach((s, i) => {
      const platform = publishable[i];
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        results.push({
          platform,
          ok: false,
          error:
            s.reason instanceof Error ? s.reason.message : String(s.reason),
          publishedAt: new Date().toISOString(),
        });
      }
    });

    const allOk = results.every((r) => r.ok);
    log.info(
      `발행 완료 [${contentId}] — 성공 ${results.filter((r) => r.ok).length}/${results.length}`,
    );

    return { contentId, results, allOk };
  }

  /** 대상 플랫폼을 결정한다. 지정이 없으면 연결된 전체. */
  private resolveTargets(targets?: PlatformId[]): PlatformId[] {
    if (targets && targets.length > 0) {
      // 등록 + 연결된 것만 통과
      return targets.filter((t) => {
        const ok =
          this.registry.platforms().includes(t) &&
          this.registry.get(t).isConnected();
        if (!ok) log.warn(`${t}: 미등록 또는 미연결 → 발행 대상에서 제외`);
        return ok;
      });
    }
    return this.registry.connected().map((p) => p.platform);
  }

  private validateAll(
    content: PostContent,
    targets: PlatformId[],
  ): Array<{ platform: PlatformId; message: string }> {
    const out: Array<{ platform: PlatformId; message: string }> = [];
    for (const platform of targets) {
      const errs = this.registry.get(platform).validate(content);
      if (errs.length > 0) {
        out.push({
          platform,
          message: `[${platform}] ${errs.join('; ')}`,
        });
      }
    }
    return out;
  }
}

function generateId(): string {
  return `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
