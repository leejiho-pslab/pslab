/**
 * 클라이언트 설정표 + 격리 저장소 (설계도 "공장 복제")
 *
 * 공장(파이프라인)은 하나만 만들고, 클라이언트마다 설정표(ClientConfig)
 * 한 장만 갈아 끼워 전용 라인을 돌린다.
 * 각 클라이언트의 상태/이력은 자기 폴더에만 저장돼 서로 섞이지 않는다.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlatformId } from './types.js';
import type { ReviewMode } from './review.js';
import type { CompetitorRef } from './research.js';
import { createLogger } from './logger.js';

const log = createLogger('client');

/** 새 클라이언트를 추가할 때 채우는 "설정표 한 장" */
export interface ClientConfig {
  /** 영문/숫자 식별자 (폴더명·키로 사용) */
  id: string;
  name: string;
  industry: string;
  /** 관심 주제/키워드 */
  keywords: string[];
  /** 벤치마킹/모니터링 대상 */
  competitors: CompetitorRef[];
  /** 브랜드 말투 */
  brandTone: string;
  /**
   * 화자 페르소나 — "누가" 1인칭으로 말하는지. 카피 품질의 핵심.
   * 예: "온라인 컨설팅·광고대행 15년차 대표. 현장 집행 경험과 실패담을 솔직하게 공유"
   */
  persona?: string;
  /** 타겟 독자 — "누구에게" 쓰는지. 예: "광고 집행을 고민하는 소상공인·마케팅 담당자" */
  audience?: string;
  /** 콘텐츠 기둥(주제축) — 채널이 반복해서 다루는 큰 주제 묶음 */
  contentPillars?: string[];
  /** 금지어 */
  bannedWords: string[];
  /** 발행할 SNS */
  targets: PlatformId[];
  /** 플랫폼별 우리 계정 핸들 (참고/표시용; 실제 인증은 .env 자격 증명으로) */
  accounts?: Partial<Record<PlatformId, string>>;
  /** 대시보드 "채널 바로가기" 링크 (채널키→관리/프로필 URL). 없으면 기본 관리콘솔 사용. */
  channelLinks?: Record<string, string>;
  /** 발행 시간 (HH:mm, 24h) */
  scheduleTimes: string[];
  /**
   * 기획안 수동 큐레이션 모드. true면 오케스트레이터가 plan.json을
   * 자동 생성으로 덮어쓰지 않는다 (검수 우선 운영 시 큐레이션 보존).
   */
  manualPlan?: boolean;
  /** 검수 스위치 초기값 */
  reviewMode: ReviewMode;
  /** 성적표 받을 곳 (이메일/메신저 식별자) */
  reportTo?: string;
}

/** 설정표 유효성 검사. 문제 메시지 배열을 반환(빈 배열이면 정상). */
export function validateClientConfig(c: Partial<ClientConfig>): string[] {
  const errs: string[] = [];
  if (!c.id || !/^[a-z0-9][a-z0-9-_]*$/i.test(c.id))
    errs.push('id는 영문/숫자로 시작하는 식별자여야 합니다.');
  if (!c.name) errs.push('name(회사 이름)이 필요합니다.');
  if (!c.industry) errs.push('industry(업종/주제)가 필요합니다.');
  if (!c.keywords || c.keywords.length === 0)
    errs.push('keywords가 1개 이상 필요합니다.');
  if (!c.targets || c.targets.length === 0)
    errs.push('targets(발행할 SNS)가 1개 이상 필요합니다.');
  if (!c.reviewMode) errs.push('reviewMode(검수 스위치)가 필요합니다.');
  for (const t of c.scheduleTimes ?? []) {
    if (!/^\d{2}:\d{2}$/.test(t))
      errs.push(`scheduleTimes 형식 오류: "${t}" (HH:mm 이어야 함)`);
  }
  return errs;
}

/** 설정표에 기본값을 채워 완전한 ClientConfig로 만든다. */
export function normalizeClientConfig(c: Partial<ClientConfig>): ClientConfig {
  const errs = validateClientConfig(c);
  if (errs.length > 0) {
    throw new Error(`클라이언트 설정표 오류:\n- ${errs.join('\n- ')}`);
  }
  return {
    id: c.id!,
    name: c.name!,
    industry: c.industry!,
    keywords: c.keywords!,
    competitors: c.competitors ?? [],
    brandTone: c.brandTone ?? '친근하고 명확하게',
    persona: c.persona,
    audience: c.audience,
    contentPillars: c.contentPillars ?? [],
    bannedWords: c.bannedWords ?? [],
    targets: c.targets!,
    accounts: c.accounts ?? {},
    channelLinks: c.channelLinks ?? {},
    scheduleTimes: c.scheduleTimes ?? ['11:00', '19:00'],
    manualPlan: c.manualPlan ?? false,
    reviewMode: c.reviewMode!,
    reportTo: c.reportTo,
  };
}

/** JSON 파일에서 설정표 하나를 읽는다. */
export function loadClient(path: string): ClientConfig {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ClientConfig>;
  return normalizeClientConfig(raw);
}

/** 디렉터리 안의 모든 *.json 설정표를 읽는다. */
export function loadClients(dir: string): ClientConfig[] {
  if (!existsSync(dir)) {
    log.warn(`클라이언트 디렉터리 없음: ${dir}`);
    return [];
  }
  const out: ClientConfig[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    // 예시 템플릿(*.example.json)은 실제 클라이언트로 로드하지 않는다
    if (file.endsWith('.example.json')) continue;
    try {
      out.push(loadClient(join(dir, file)));
    } catch (err) {
      log.error(`${file} 로드 실패 — ${err instanceof Error ? err.message : err}`);
    }
  }
  log.info(`클라이언트 ${out.length}곳 로드`);
  return out;
}

/**
 * 클라이언트별 격리 저장소 (잠긴 서랍).
 *
 * 각 클라이언트의 사이클 이력을 자기 폴더(JSON)에만 기록한다.
 * 서로 다른 클라이언트의 데이터는 절대 섞이지 않는다.
 */
export class ClientStore<T = unknown> {
  constructor(private readonly baseDir: string) {}

  private fileFor(clientId: string): string {
    const dir = join(this.baseDir, clientId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, 'history.json');
  }

  /** 한 클라이언트의 이력을 읽는다. */
  read(clientId: string): T[] {
    const file = this.fileFor(clientId);
    if (!existsSync(file)) return [];
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T[];
    } catch {
      return [];
    }
  }

  /** 이력에 한 건 추가한다. */
  append(clientId: string, record: T): void {
    const file = this.fileFor(clientId);
    const all = this.read(clientId);
    all.push(record);
    writeFileSync(file, JSON.stringify(all, null, 2), 'utf8');
  }
}
