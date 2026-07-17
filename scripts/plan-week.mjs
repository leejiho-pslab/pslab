#!/usr/bin/env node
/**
 * 차주(다음 주) 콘텐츠 주간 기획 — 키워드 검색량 기반
 *
 * 매주 주말(토/일)에 실행. keyword-trends.json(핵심·시의성)의 검색량 상위 키워드로
 * 다음 주 월~일 콘텐츠 기획안(채널·날짜·키워드·제안 제목)을 만들어 week-plan.json 에 저장.
 * → 대시보드 "📅 차주 콘텐츠 기획" 패널에 표시. 실제 제작은 이 기획안을 기준으로
 *    (감도·가짜글자 검수 포함) 진행한다. plan.json(라이브 콘텐츠)은 건드리지 않아 안전.
 *
 * 사용: node scripts/plan-week.mjs --client pslab
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'pslab');
const dir = join(ROOT, 'data/clients', clientId);
if (!existsSync(dir)) { console.log('데이터 폴더 없음 — 건너뜀'); process.exit(0); }

// 키워드 로드
let core = [], timely = [];
try {
  const kw = JSON.parse(readFileSync(join(dir, 'keyword-trends.json'), 'utf8'));
  core = (kw.core || kw.keywords || []).filter((k) => k && k.kw);
  timely = (kw.timely || []).filter((k) => k && k.kw);
} catch { /* 키워드 없으면 기본 시드로 */ }
// 예시 시드 — 업체별로 교체
if (!core.length) core = ['싸바리박스', '패키지제작', '화장품박스', '단상자', '금박인쇄', '선물세트박스'].map((kw) => ({ kw, total: 0 }));

// 다음 주 월요일(UTC) 계산 — 실행일(주말) 기준
const now = new Date();
const dow = now.getUTCDay(); // 0=일..6=토
const daysToNextMon = ((8 - dow) % 7) || 7; // 다음 주 월요일까지
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToNextMon, 9, 0, 0)); // 09:00 UTC = 18:00 KST

// 주 회차(키워드 로테이션용) — 연중 주차
const weekNo = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(now.getUTCFullYear(), 0, 1)) / 604800000);

// 요일별 채널 스케줄(월~일). null=휴무
const SCHEDULE = ['naver-blog', 'instagram', 'blogger', 'instagram', 'naver-blog', 'instagram', null];

// 제안 제목 템플릿(채널별) — {kw} 치환
const T = {
  'naver-blog': [
    '{kw}, 실무자가 꼭 아는 3가지 — 제작 전 체크리스트',
    '{kw} 제대로 고르는 법 (구조·후가공·견적 한 번에)',
    '{kw}, 왜 브랜드마다 다를까 — 브랜드명 실장의 정리' /* 업체별 교체 */,
  ],
  blogger: [
    '{kw} 완벽 가이드 — 종류·비용·주의점 비교',
    '{kw} 발주 전 체크리스트 (예산·납기·샘플)',
    '{kw}, 초보도 실패 안 하는 선택 기준',
  ],
  instagram: [
    '{kw}, 이것만 알면 반은 성공 ✨',
    '{kw} 고를 때 놓치기 쉬운 포인트',
    '{kw}의 디테일, 여기서 갈립니다',
  ],
};
const pick = (arr, i) => arr[i % arr.length];
const CH_LABEL = { 'naver-blog': '네이버 블로그', blogger: '구글 블로그', instagram: '인스타그램' };

// 키워드 풀: 핵심 상위 + 시의성 1~2개(시의성 주 1회+). 주차로 로테이션해 매주 다른 소재.
const coreTop = core.slice(0, 12);
const items = [];
let ci = weekNo; // 로테이션 시작점
for (let d = 0; d < 7; d++) {
  const ch = SCHEDULE[d];
  if (!ch) continue;
  const date = new Date(monday.getTime() + d * 86400000);
  // 시의성: 인스타 첫 슬롯 or 수요일에 1회 배치, 나머지는 핵심 로테이션
  let kwObj, sheet;
  if (timely.length && (d === 2 || (d === 1 && items.length === 0))) {
    kwObj = timely[(weekNo) % timely.length]; sheet = '시의성';
  } else {
    kwObj = coreTop[ci % coreTop.length]; ci++; sheet = '핵심';
  }
  const kw = kwObj.kw;
  const tmpl = pick(T[ch] || T['naver-blog'], ci);
  items.push({
    date: date.toISOString().slice(0, 10),
    scheduledFor: date.toISOString(),
    channel: ch, channelLabel: CH_LABEL[ch] || ch,
    keyword: kw, sheet, volume: kwObj.total || 0,
    title: tmpl.replace(/\{kw\}/g, kw),
    status: 'proposed',
  });
}

const out = {
  generatedAt: now.toISOString(),
  weekStart: monday.toISOString().slice(0, 10),
  weekEnd: new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10),
  note: '키워드 검색량 기반 차주 기획안 · 제작은 감도/가짜글자 검수 후 진행',
  items,
};
writeFileSync(join(dir, 'week-plan.json'), JSON.stringify(out, null, 2));
console.log(`차주 기획 생성: ${out.weekStart}~${out.weekEnd} · ${items.length}건`);
items.forEach((it) => console.log(`  ${it.date} ${it.channelLabel} · #${it.keyword}(${it.sheet}) → ${it.title}`));
