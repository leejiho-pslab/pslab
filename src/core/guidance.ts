/**
 * 운영자 지침(브랜드 노트 + 채널별 콘텐츠 가이드) — AI가 "상시 학습"하는 입력 창구
 *
 * 대시보드 '지침' 탭에서 작성 → 깃허브 이슈(제목 규약) → guidance-sync 워크플로가
 * 이 저장소 파일에 반영 → 다음 생성 사이클부터 프롬프트·소재 선정에 자동 적용.
 *
 *   [브랜드노트·분석]   → brand-brief.json analysis
 *   [브랜드노트·방향성] → brand-brief.json direction
 *   [브랜드노트·감도]   → brand-brief.json sensibility
 *   [가이드·<채널key>]  → channel-guides.json (본문 "주제:" 줄은 소재 풀, 나머지는 가이드)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { PlatformId } from './types.js';

/** 브랜드 노트 — 운영자가 수시로 갱신하는 브랜드 이해 */
export interface BrandBrief {
  /** 브랜드 분석 (우리가 어떤 브랜드인지) */
  analysis?: string;
  /** 방향성 의견 (어디로 가야 하는지) */
  direction?: string;
  /** 콘텐츠 감도 (톤·비주얼·무드 기준) */
  sensibility?: string;
  updatedAt?: string;
  /** 최근 갱신 이력 (최대 20) */
  log?: Array<{ at: string; field: string; excerpt: string }>;
}

/** 채널별 콘텐츠 가이드 */
export interface ChannelGuide {
  /** 우선 소재 풀 — 기획 소재 선정에서 가장 먼저 고려 */
  topics: string[];
  /** 핵심 가이드 본문 — 글 생성 프롬프트에 그대로 주입 */
  guide: string;
  updatedAt?: string;
}
export type ChannelGuides = Partial<Record<PlatformId, ChannelGuide>>;

export const BRAND_FIELDS: Record<string, keyof BrandBrief> = {
  분석: 'analysis',
  방향성: 'direction',
  감도: 'sensibility',
};

/** 이슈 본문 → 채널 가이드 파싱. "주제:" 로 시작하는 줄은 소재 풀(쉼표 구분). */
export function parseGuideBody(body: string): { topics: string[]; guide: string } {
  const topics: string[] = [];
  const rest: string[] = [];
  for (const line of String(body || '').split('\n')) {
    const m = line.trim().match(/^(?:주제|토픽|topics?)\s*[:：]\s*(.+)$/i);
    if (m) {
      topics.push(...m[1].split(/[,，·]/).map((s) => s.trim()).filter(Boolean));
    } else {
      rest.push(line);
    }
  }
  return { topics, guide: rest.join('\n').trim() };
}

/** 프롬프트 주입용 — 브랜드 노트를 한 덩어리 텍스트로 */
export function brandNotesText(b: BrandBrief | undefined): string | undefined {
  if (!b) return undefined;
  const parts = [
    b.analysis ? `- 브랜드 분석: ${b.analysis}` : '',
    b.direction ? `- 방향성: ${b.direction}` : '',
    b.sensibility ? `- 콘텐츠 감도(톤·무드): ${b.sensibility}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : undefined;
}

/** data/<clientId>/brand-brief.json + channel-guides.json 저장소 */
export class GuidanceStore {
  constructor(private readonly baseDir: string) {}

  private file(clientId: string, name: string): string {
    return join(this.baseDir, clientId, name);
  }

  private read<T>(path: string): T | undefined {
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as T;
    } catch {
      return undefined;
    }
  }

  private write(path: string, value: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
  }

  loadBrief(clientId: string): BrandBrief {
    return this.read<BrandBrief>(this.file(clientId, 'brand-brief.json')) ?? {};
  }

  saveBrief(clientId: string, brief: BrandBrief): void {
    this.write(this.file(clientId, 'brand-brief.json'), brief);
  }

  /** 브랜드 노트 한 필드를 갱신하고 이력을 남긴다. */
  updateBriefField(clientId: string, field: keyof BrandBrief, text: string): BrandBrief {
    const b = this.loadBrief(clientId);
    (b as Record<string, unknown>)[field] = text;
    b.updatedAt = new Date().toISOString();
    b.log = [
      { at: b.updatedAt, field: String(field), excerpt: text.slice(0, 80) },
      ...(b.log ?? []),
    ].slice(0, 20);
    this.saveBrief(clientId, b);
    return b;
  }

  loadGuides(clientId: string): ChannelGuides {
    return this.read<ChannelGuides>(this.file(clientId, 'channel-guides.json')) ?? {};
  }

  saveGuides(clientId: string, guides: ChannelGuides): void {
    this.write(this.file(clientId, 'channel-guides.json'), guides);
  }

  updateGuide(clientId: string, channel: PlatformId, patch: { topics: string[]; guide: string }): ChannelGuides {
    const g = this.loadGuides(clientId);
    g[channel] = {
      topics: patch.topics.length ? patch.topics : (g[channel]?.topics ?? []),
      guide: patch.guide || (g[channel]?.guide ?? ''),
      updatedAt: new Date().toISOString(),
    };
    this.saveGuides(clientId, g);
    return g;
  }
}
