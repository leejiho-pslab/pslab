/**
 * 콘텐츠 플랜 / 발행 대기 큐 (대시보드 "발행 대기 콘텐츠" 용)
 *
 * 시장 조사가 뽑은 상위 소재 후보를 다가오는 발행 슬롯에 배정해
 * "예정(대기) 콘텐츠"로 보관한다. 발행된 것은 사이클 이력에, 예정인 것은
 * 이 플랜에 — 둘을 합쳐 대시보드의 발행/대기 현황을 만든다.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import type { PlatformId } from './types.js';
import type { ClientConfig } from './client.js';
import type { TopicCandidate } from './research.js';

/** 캐러셀 한 장 (커버 다음에 이어지는 내용 슬라이드) */
export interface PlanSlide {
  /** 좌상단 구분 라벨 (예: "01", "WHY", "정리") */
  label?: string;
  /** 슬라이드 제목 */
  title?: string;
  /** 슬라이드 본문 (줄바꿈 \n 허용) */
  body?: string;
}

export interface PlanItem {
  id: string;
  topic: string;
  format: string;
  channels: PlatformId[];
  /** 발행 예정 시각 (ISO) */
  scheduledFor: string;
  score: number;
  status: 'planned' | 'approved' | 'published' | 'manual';
  rationale?: string;
  /** 매거진 카드 상단 라벨 (예: "Marketing Insight") */
  kicker?: string;
  /** 카드 헤드라인 (강조어는 *별표*로 감싼다: "점검할 *3가지*") */
  headline?: string;
  /** 카드 보조 문구 */
  sub?: string;
  /** 카드 하단 라벨 (예: "월요일 · 인사이트") */
  dayLabel?: string;
  /** 카드 팔레트 키 (ink/paper/forest) */
  palette?: string;
  /** 주제 그래픽 모티프 키 (chart/lock/compass/branch/rocket/bulb/growth) */
  motif?: string;
  /** 디자인 변형 (A/B/C) — 반응도 A/B 테스트용 */
  variant?: string;
  /** 발행 캡션 전체 본문 (모달 상세에서 노출) */
  captionBody?: string;
  /** 캐러셀 내용 슬라이드 (커버 다음 장들) */
  slides?: PlanSlide[];
  /** 렌더된 전체 슬라이드 이미지 경로들 (커버 포함, 순서대로) */
  slideImages?: string[];
  /** 렌더된 카드 이미지 경로 (대시보드 상대 경로 — 커버=슬라이드1) */
  cardImage?: string;
  /** 캡션(본문) 방향 메모 */
  captionNote?: string;
  /** 발행 완료된 게시물 URL */
  publishedUrl?: string;
  /** 발행 완료 시각 (ISO) */
  publishedAt?: string;
  /** 채널별 발행 결과 (성과 수집용 — 플랫폼별 remoteId 보관) */
  published?: PlanPublication[];
  /** 최근 수집한 성과 지표 (좋아요·조회·참여율) */
  metrics?: PlanMetrics;
  /** 성과 수집 시각 (ISO) */
  metricsAt?: string;
  /** 성과 데이터를 본 인사이트 코멘트 (왜 잘됐나/다음 방향) */
  insightComment?: string;
  /** 인사이트 코멘트 생성 시각 (ISO) */
  insightAt?: string;
  /** 유튜브 쇼츠: 자동 합성된 영상 파일 경로 (대시보드 상대 경로) */
  videoFile?: string;
  /** 유튜브 업로드용 SEO 제목 */
  ytTitle?: string;
  /** 유튜브 업로드용 설명(멘션) — 키워드 기반 SEO */
  ytDescription?: string;
  /** 유튜브 업로드용 태그(키워드) */
  ytTags?: string[];
}

/** 한 채널에 실제 발행된 결과 (성과 수집에 필요한 식별자) */
export interface PlanPublication {
  platform: PlatformId;
  remoteId: string;
  url?: string;
}

/** 게시물 성과 스냅샷 (대시보드·학습용) */
export interface PlanMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  /** 0~1 참여율 */
  engagementRate?: number;
}

/** 자동 발행을 지원하지 않는 수동 채널 (복붙 발행) — 네이버 블로그는 공식 발행 API가 없다. */
export const MANUAL_CHANNELS: PlatformId[] = ['naver-blog'];

/** 해당 항목이 전부 수동 채널로만 구성됐는지 */
export function isManualOnly(channels: PlatformId[]): boolean {
  return channels.length > 0 && channels.every((c) => MANUAL_CHANNELS.includes(c));
}

export interface ContentPlan {
  updatedAt: string;
  items: PlanItem[];
}

/** scheduleTimes(HH:mm)를 기준으로 now 이후의 발행 슬롯 N개를 만든다. */
export function upcomingSlots(
  scheduleTimes: string[],
  now: Date,
  count: number,
): Date[] {
  const times = (scheduleTimes.length ? scheduleTimes : ['11:00', '19:00'])
    .map((t) => t.split(':').map(Number))
    .sort((a, b) => a[0] * 60 + a[1] - (b[0] * 60 + b[1]));
  const slots: Date[] = [];
  let day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (slots.length < count) {
    for (const [h, m] of times) {
      const slot = new Date(day);
      slot.setHours(h, m, 0, 0);
      if (slot.getTime() > now.getTime()) slots.push(slot);
      if (slots.length >= count) break;
    }
    day = new Date(day.getTime() + 24 * 3600 * 1000);
  }
  return slots;
}

/** 후보 소재를 다가오는 슬롯에 배정해 플랜을 만든다. */
export function generatePlan(
  client: ClientConfig,
  candidates: TopicCandidate[],
  now: Date,
  max = 6,
): ContentPlan {
  const picks = candidates.slice(0, max);
  const slots = upcomingSlots(client.scheduleTimes, now, picks.length);
  const items: PlanItem[] = picks.map((c, i) => ({
    id: `plan_${i}_${slots[i].getTime()}`,
    topic: c.topic,
    format: c.suggestedFormat,
    channels: client.targets,
    scheduledFor: slots[i].toISOString(),
    score: c.score,
    status: 'planned',
    rationale: c.rationale,
  }));
  return { updatedAt: now.toISOString(), items };
}

/** 클라이언트별 플랜 저장소 (격리, 단일 객체 덮어쓰기). */
export class PlanStore {
  constructor(private readonly baseDir: string) {}

  private fileFor(clientId: string): string {
    return join(this.baseDir, clientId, 'plan.json');
  }

  load(clientId: string): ContentPlan {
    const file = this.fileFor(clientId);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as ContentPlan;
      } catch {
        /* fallthrough */
      }
    }
    return { updatedAt: new Date(0).toISOString(), items: [] };
  }

  save(clientId: string, plan: ContentPlan): void {
    const file = this.fileFor(clientId);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(plan, null, 2), 'utf8');
  }
}
