/**
 * 구글 블로그(Blogger) 발행 항목 시드.
 *
 * 네이버 블로그 완성글(captionBody)을 그대로 Blogger 채널 항목으로 복제한다.
 * 네이버는 수동(복붙), Blogger는 API 자동발행 — 같은 글을 두 곳에 운영.
 * 재실행 가능: 기존 blogger 항목을 지우고 다시 만든다.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'data/clients/pslab/plan.json';
const plan = JSON.parse(readFileSync(FILE, 'utf8'));

const naver = plan.items.filter((i) => i.channels[0] === 'naver-blog');
// 기존 blogger 항목 제거 후 재생성
plan.items = plan.items.filter((i) => i.channels[0] !== 'blogger');

let added = 0;
for (const nb of naver) {
  // 네이버 발행 다음 날 09:00에 블로거 발행(중복 노출 분산)
  const d = new Date(nb.scheduledFor);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const it = {
    ...nb,
    id: nb.id.replace('naver-blog', 'blogger'),
    channels: ['blogger'],
    scheduledFor: d.toISOString(),
    status: 'planned',
    format: 'blogger',
  };
  // 발행/성과 상태는 복제하지 않음
  delete it.published;
  delete it.publishedUrl;
  delete it.publishedAt;
  delete it.metrics;
  delete it.metricsAt;
  delete it.insightComment;
  delete it.insightAt;
  plan.items.push(it);
  added++;
}

plan.updatedAt = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(plan, null, 2), 'utf8');
console.log(`Blogger 항목 ${added}건 시드 완료 (총 ${plan.items.length}건)`);
