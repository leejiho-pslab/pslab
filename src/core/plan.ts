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

export interface PlanItem {
  id: string;
  topic: string;
  format: string;
  channels: PlatformId[];
  /** 발행 예정 시각 (ISO) */
  scheduledFor: string;
  score: number;
  status: 'planned';
  rationale?: string;
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
