/**
 * 인사이트 코멘트 엔진 (대시보드 업그레이드 기능 ②)
 *
 * 발행물의 성과 데이터를 학습 평균과 비교해 "왜 잘됐나 / 다음엔 이렇게" 코멘트를
 * 단다. ANTHROPIC_API_KEY가 있으면 대표님 1인칭 톤으로 AI가 쓰고, 없으면 수치
 * 기반 규칙으로 폴백한다. 이 코멘트는 대시보드에 노출되고 다음 기획의 참고가 된다.
 */
import type { PlanItem } from './plan.js';
import type { LearningSummary } from './learning.js';
import type { ClientConfig } from './client.js';
import { claudeText } from './claude.js';

const CHANNEL_LABEL: Record<string, string> = {
  instagram: '인스타그램',
  threads: '스레드',
  'naver-blog': '네이버 블로그',
  youtube: '유튜브',
  linkedin: '링크드인',
};

function engagementOf(it: PlanItem): number {
  const m = it.metrics;
  if (!m) return 0;
  if (typeof m.engagementRate === 'number' && m.engagementRate > 0) return m.engagementRate;
  return 0;
}

function plainHead(it: PlanItem): string {
  return (it.headline ?? it.topic).replace(/<br>/g, ' ').replace(/\*/g, '');
}

/** 학습 표본 평균 참여율(없으면 0). */
function baselineEngagement(learning?: LearningSummary): number {
  if (!learning || !learning.variants.length) return 0;
  const all = learning.variants;
  const sum = all.reduce((a, g) => a + g.avgEngagement * g.posts, 0);
  const n = all.reduce((a, g) => a + g.posts, 0);
  return n > 0 ? sum / n : 0;
}

/** 수치 기반 규칙 코멘트 (API 키 없을 때 폴백). */
export function ruleComment(it: PlanItem, learning?: LearningSummary): string {
  const m = it.metrics;
  if (!m) return '성과 수집 전입니다.';
  const er = engagementOf(it);
  const base = baselineEngagement(learning);
  const erPct = (er * 100).toFixed(1);
  const basePct = (base * 100).toFixed(1);
  const v = it.variant ? `디자인 ${it.variant}안` : '이 구성';
  if (base > 0 && er >= base * 1.1) {
    return `참여율 ${erPct}%로 평균(${basePct}%)을 웃돌았어요. ${v}·결론 우선 구조가 먹힌 것으로 보입니다 — 다음에도 같은 톤을 유지하세요.`;
  }
  if (base > 0 && er > 0 && er < base * 0.9) {
    return `참여율 ${erPct}%로 평균(${basePct}%)을 밑돌았어요. 첫 슬라이드 후킹과 결론 한 줄을 더 세게, 저장 유도 문구를 명확히 해보세요.`;
  }
  if (er > 0) {
    return `참여율 ${erPct}% — 평균 수준입니다. 좋아요 ${m.likes ?? 0}·댓글 ${m.comments ?? 0}. 다음엔 댓글을 유도하는 질문형 마무리를 시도해보세요.`;
  }
  return `조회 ${m.views ?? 0}·좋아요 ${m.likes ?? 0}. 노출 대비 반응을 키우려면 첫 3초 후킹을 강화하세요.`;
}

/**
 * 인사이트 코멘트를 만든다. 키가 있으면 AI(대표 톤), 없으면 규칙 폴백.
 */
export async function makeInsightComment(
  client: ClientConfig,
  it: PlanItem,
  learning?: LearningSummary,
): Promise<string> {
  const fallback = ruleComment(it, learning);
  const m = it.metrics;
  if (!m) return fallback;

  const ch = CHANNEL_LABEL[it.channels[0]] ?? it.channels[0];
  const base = baselineEngagement(learning);
  const system = [
    `당신은 "${client.persona ?? client.name}"입니다. 본인이 운영하는 SNS의 성과를 직접 코칭하는 1인칭 톤으로,`,
    '발행물 한 건의 성과 데이터를 보고 한국어 2~3문장으로 인사이트 코멘트를 씁니다.',
    '형식: ① 결과 한 줄 평가(평균 대비) ② 원인 추정(디자인/구성/주제) ③ 다음에 적용할 구체 액션 1가지.',
    '과장·일반론 금지. 숫자를 근거로. 담백하고 실무적으로.',
  ].join('\n');
  const user = [
    `채널: ${ch}`,
    `제목: ${plainHead(it)}`,
    it.variant ? `디자인 변형: ${it.variant}안` : '',
    it.motif ? `주제 그래픽: ${it.motif}` : '',
    `성과: 조회 ${m.views ?? 0}, 좋아요 ${m.likes ?? 0}, 댓글 ${m.comments ?? 0}, 참여율 ${((m.engagementRate ?? 0) * 100).toFixed(1)}%`,
    base > 0 ? `현재 평균 참여율: ${(base * 100).toFixed(1)}%` : '평균 데이터 부족(표본 적음)',
  ]
    .filter(Boolean)
    .join('\n');

  const ai = await claudeText({ system, user, maxTokens: 400 });
  return ai ?? fallback;
}
