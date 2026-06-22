/**
 * 제작 능력 자가 업그레이드 (설계도 2번 작업소 "스스로 장비 강화")
 *
 * 공장이 쓸 수 있는 제작 도구(텍스트/이미지/영상/조사 능력)를 목록으로 관리한다.
 * 새 스킬·플러그인·MCP를 찾아오는 일은 CapabilitySource로 주입하고,
 * 발견된 후보(candidate)는 성과가 검증되면 active로 승격한다.
 *
 * 실제 도구 탐색/설치는 외부에서 CapabilitySource로 연결한다.
 * (여기서는 등록·승격·교체 로직과 결정 규칙만 담당)
 */
import { createLogger } from './logger.js';

const log = createLogger('capabilities');

export type CapabilityKind = 'text' | 'image' | 'video' | 'research';
export type CapabilityStatus = 'active' | 'candidate' | 'rejected';

export interface Capability {
  id: string;
  kind: CapabilityKind;
  name: string;
  status: CapabilityStatus;
  /** 0~100 품질 점수 (시험 결과로 갱신) */
  score?: number;
  source?: string;
}

/** 새 능력을 발견해 오는 소스 (도구 마켓/MCP 카탈로그 등) */
export interface CapabilitySource {
  discover(): Promise<Capability[]>;
}

export interface PromotionPolicy {
  /** candidate가 active로 승격되는 최소 점수 */
  promoteAtScore: number;
  /** 같은 kind에서 active로 유지할 최대 개수 (초과 시 저점부터 교체) */
  maxActivePerKind: number;
}

const DEFAULT_POLICY: PromotionPolicy = {
  promoteAtScore: 70,
  maxActivePerKind: 2,
};

/**
 * 능력 레지스트리.
 *
 * - register/discover로 후보를 모으고
 * - evaluate로 점수를 매기고
 * - reconcile로 정책에 따라 active 세트를 갱신한다.
 */
export class CapabilityRegistry {
  private readonly caps = new Map<string, Capability>();

  constructor(private readonly policy: PromotionPolicy = DEFAULT_POLICY) {}

  register(cap: Capability): void {
    this.caps.set(cap.id, { ...cap });
    log.debug(`능력 등록: ${cap.name} (${cap.kind}/${cap.status})`);
  }

  /** 외부 소스들에서 새 능력 후보를 발견해 candidate로 등록한다. */
  async discover(sources: CapabilitySource[]): Promise<Capability[]> {
    const found: Capability[] = [];
    for (const src of sources) {
      const caps = await src.discover();
      for (const c of caps) {
        if (!this.caps.has(c.id)) {
          this.register({ ...c, status: 'candidate' });
          found.push(c);
        }
      }
    }
    log.info(`새 능력 후보 ${found.length}개 발견`);
    return found;
  }

  /** 시험 결과 점수를 기록한다. */
  evaluate(id: string, score: number): void {
    const cap = this.caps.get(id);
    if (!cap) return;
    cap.score = score;
  }

  /**
   * 정책에 따라 active 세트를 재조정한다.
   * - promoteAtScore 이상인 candidate를 active 후보로
   * - kind별 점수 상위 maxActivePerKind개만 active 유지, 나머지는 candidate로 강등
   */
  reconcile(): void {
    const byKind = new Map<CapabilityKind, Capability[]>();
    for (const cap of this.caps.values()) {
      if (cap.status === 'rejected') continue;
      // 승격 자격
      if (cap.status === 'candidate' && (cap.score ?? 0) >= this.policy.promoteAtScore) {
        cap.status = 'active';
      }
      if (!byKind.has(cap.kind)) byKind.set(cap.kind, []);
      byKind.get(cap.kind)!.push(cap);
    }

    for (const [, caps] of byKind) {
      const active = caps
        .filter((c) => c.status === 'active')
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      // 상한 초과분은 candidate로 강등
      active.slice(this.policy.maxActivePerKind).forEach((c) => {
        c.status = 'candidate';
        log.info(`능력 강등(상한 초과): ${c.name}`);
      });
    }
  }

  active(kind?: CapabilityKind): Capability[] {
    return [...this.caps.values()].filter(
      (c) => c.status === 'active' && (!kind || c.kind === kind),
    );
  }

  all(): Capability[] {
    return [...this.caps.values()];
  }
}
