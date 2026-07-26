#!/usr/bin/env node
/**
 * pslab 운영 체제 개편 시드 (2026-07-26, 일회성)
 *
 * 1) 발행 대기(planned/manual) 항목 전량 삭제 + 관련 렌더 자산 정리
 * 2) 브랜드 브리프를 "ALWAYS ON 설명·설득 캠페인" 체제로 갱신
 *    - 주 3회: 월·수·금 18:00 KST, 인스타그램 단일 채널
 *    - 릴스 2회(월·금) + 캐러셀 1회(수), 첫 장은 강한 훅/인터랙션
 * 3) 다음 주(7/27 릴스 · 7/29 캐러셀 · 7/31 릴스) 3건 추가
 *
 * 릴스 항목: format '릴스' + reelsScript([HOOK]/[본론]/[CTA]) → render-shorts →
 * build-shorts-video(ffmpeg, CI)가 docs/shorts/<id>/<id>.mp4 합성 후 videoFile 기록.
 *
 * 사용: node scripts/seed-plan-alwayson-w1.mjs
 */
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date().toISOString();

// ── 1) 대기 항목 삭제 ────────────────────────────────────────────────
const planPath = join(ROOT, 'data/clients/pslab/plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const kept = plan.items.filter((i) => i.status === 'published');
const removed = plan.items.filter((i) => i.status !== 'published').map((i) => i.id);
plan.items = kept;
console.log(`✓ 대기 항목 ${removed.length}건 삭제 (발행 완료 ${kept.length}건 유지)`);
console.log('  삭제:', removed.join(', '));

// 관련 렌더 자산 정리
const cardsDir = join(ROOT, 'docs/cards/pslab');
let rmFiles = 0;
if (existsSync(cardsDir)) {
  for (const f of readdirSync(cardsDir)) {
    if (removed.some((id) => f.startsWith(`${id}-`))) { unlinkSync(join(cardsDir, f)); rmFiles++; }
  }
}
for (const id of removed) {
  for (const dir of [join(ROOT, 'docs/blog', id), join(ROOT, 'docs/shorts', id)]) {
    if (existsSync(dir)) { rmSync(dir, { recursive: true }); rmFiles++; }
  }
}
console.log(`✓ 렌더 자산 정리 (${rmFiles}개 파일/폴더)`);

// 블로그 도표 스펙 정리 (삭제된 글의 스펙 제거)
const figPath = join(ROOT, 'data/clients/pslab/blog-figures.json');
const figs = JSON.parse(readFileSync(figPath, 'utf8'));
const keptFigs = figs.filter((f) => !removed.includes(f.id));
writeFileSync(figPath, JSON.stringify(keptFigs, null, 2) + '\n');
console.log(`✓ blog-figures ${figs.length - keptFigs.length}건 정리`);

// ── 2) 브리프·설정표 갱신 — ALWAYS ON 설득 캠페인 체제 ───────────────
const briefPath = join(ROOT, 'data/clients/pslab/brand-brief.json');
const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
brief.direction =
  'ALWAYS ON 솔루션 설명·설득 캠페인에 집중. 주 3회(월·수·금 18:00 KST) 인스타그램 단일 채널 — 릴스 2회(월·금) + 캐러셀 1회(수). 첫 장/첫 3초는 잠재 고객(사장님)을 향한 강한 훅·인터랙션(질문·댓글 유도)으로 연다. 문제 공감 → 작동 방식 → 가치 환산의 설득 구조. 매주 토요일 다음 주 기획을 생성한다.';
brief.updatedAt = now;
brief.log = brief.log || [];
brief.log.push({
  at: now,
  field: 'direction',
  excerpt: '주3회(월수금) 인스타 체제 전환 — ALWAYS ON 설명·설득 중심, 릴스2+캐러셀1, 첫 장 강한 훅',
});
writeFileSync(briefPath, JSON.stringify(brief, null, 2) + '\n');

const clientPath = join(ROOT, 'clients/pslab.json');
const client = JSON.parse(readFileSync(clientPath, 'utf8'));
client.contentPillars = [
  'ALWAYS ON 솔루션 설명·설득 (핵심 캠페인)',
  '문제 공감 — 5채널 매일 운영의 현실',
  '작동 방식·차별점 — 조사·제작·발행·학습 자동화',
  '가치 환산 — 인건비·대행비·시간·콘텐츠 자산',
  '신뢰 근거 — 16년차 대행사가 직접 운영하는 증명',
];
client.cadence = {
  note: '주 3회 월·수·금 18:00 KST — 인스타그램 릴스 2회(월·금) + 캐러셀 1회(수). 토요일에 다음 주 기획 생성.',
  weekly: [
    { day: 'mon', channel: 'instagram', format: '릴스' },
    { day: 'wed', channel: 'instagram', format: '카드뉴스' },
    { day: 'fri', channel: 'instagram', format: '릴스' },
  ],
};
writeFileSync(clientPath, JSON.stringify(client, null, 2) + '\n');
console.log('✓ 브리프·설정표 갱신 (ALWAYS ON 설득 캠페인 체제)');

// ── 3) 다음 주 3건 (7/27 릴스 · 7/29 캐러셀 · 7/31 릴스) ─────────────
const at = (d) => `2026-07-${d}T09:00:00.000Z`; // 18:00 KST

const NEW_ITEMS = [
  {
    id: 'reels-07-27', topic: 'ALWAYS ON · 문제 제기', format: '릴스', channels: ['instagram'],
    scheduledFor: at(27), score: 90, status: 'planned',
    kicker: 'ALWAYS ON', headline: '마지막 게시물,<br>*언제 올리셨어요?*',
    sub: '3주 멈춘 SNS, 손님 눈엔 닫힌 가게입니다.',
    dayLabel: '월요일 · 릴스', motif: 'lock', variant: 'A', palette: 'ink',
    reelsScript:
      '[HOOK]\n사장님, 마지막 SNS 게시물 언제 올리셨어요?\n\n[본론]\n3주 멈춘 계정, 손님 눈엔 닫힌 가게예요.\n근데 매일 5개 채널을 혼자? 애초에 무리입니다.\n그래서 시스템이 대신합니다 — ALWAYS ON.\n조사, 제작, 발행, 성과 학습까지 매일 자동.\n주무시는 동안에도 채널이 올라갑니다.\n\n[CTA]\n댓글에 "온"이라고 남겨보세요.\n솔루션 소개서를 보내드립니다.',
    captionBody:
      '사장님, 마지막 SNS 게시물 언제 올리셨어요?\n\n3주 멈춘 SNS는 손님 눈에 "닫힌 가게"로 보입니다. 그렇다고 매일 5개 채널을 혼자 올리는 건 애초에 무리예요. 의지가 아니라 구조의 문제거든요.\n\nALWAYS ON은 조사→제작→발행→성과 학습을 매일 자동으로 돌리는 SNS 채널 자동화 솔루션입니다. 사장님이 주무시는 동안에도 인스타·블로그·스레드·유튜브가 올라갑니다.\n\n장사에 집중하세요. 채널은 시스템이 지킵니다.\n\n💬 댓글에 "온"이라고 남기면 솔루션 소개서를 보내드려요.\n\n#ALWAYSON #얼웨이즈온 #SNS자동화 #SNS마케팅 #소상공인마케팅 #사장님',
    captionNote: '문제 공감 훅 — 멈춘 계정의 신호 → ALWAYS ON 소개, 댓글 인터랙션 유도',
    rationale: '첫 3초 질문형 훅으로 잠재 고객(사장님) 공감 → 솔루션 인지 + 댓글 리드 수집',
    slides: [], slideImages: [],
  },
  {
    id: 'car-07-29', topic: 'ALWAYS ON · 솔루션 설명', format: '카드뉴스', channels: ['instagram'],
    scheduledFor: at(29), score: 89, status: 'planned',
    kicker: 'ALWAYS ON', headline: '오늘도 SNS,<br>*못 올리셨죠?*',
    sub: '괜찮습니다 — 안 올려도 올라가게 만들면 됩니다.',
    dayLabel: '수요일 · 캐러셀', motif: 'branch', variant: 'B', palette: 'ink',
    captionBody:
      '오늘도 SNS 못 올리셨죠? 괜찮습니다. "안 올려도 올라가게" 만들면 되니까요.\n\nALWAYS ON은 16년차 광고대행사 P.S.LAB이 만든 SNS 채널 자동화 솔루션입니다.\n\n✔ 조사·기획부터 제작·발행·성과 학습까지 매일 자동\n✔ 인스타·네이버 블로그·구글 블로그·스레드·유튜브 5채널 동시 발행\n✔ 시장·경쟁사·키워드 조사로 반응 나올 주제부터 공략\n✔ 대시보드 링크 하나로 전 채널 관제 + 텔레그램 알림\n\n사람을 쓰면 월 300만원, 대행에 맡기면 월 500만원+. 그 일을 시스템이 대신합니다.\n\n💾 저장해두고, 프로필 링크에서 솔루션 소개서를 받아보세요.\n\n#ALWAYSON #얼웨이즈온 #SNS자동화 #SNS마케팅 #콘텐츠마케팅 #소상공인 #자영업',
    captionNote: '훅(공감 질문) → 솔루션 설명 → 가치 환산 → 저장·프로필 링크 CTA',
    rationale: '캐러셀로 솔루션 전체 구조를 설명·설득 — 저장 유도형',
    slides: [
      { label: 'Q', title: '오늘도 SNS, 못 올리셨죠?', body: '바빠서, 뭘 올릴지 몰라서… 어느새 3주.\n사장님 잘못이 아니라 구조의 문제입니다.' },
      { label: '01', title: '안 올려도 올라갑니다', body: 'ALWAYS ON — 조사·기획, 글·이미지·영상 제작,\n발행, 성과 학습까지 매일 스스로 도는 자동화 솔루션.' },
      { label: '02', title: '5개 채널 동시에', body: '인스타 · 네이버 블로그 · 구글 블로그 · 스레드 · 유튜브.\n매일 정해진 시각, 다섯 채널에 한 번에.' },
      { label: '03', title: '그냥 올리지 않습니다', body: '16년차 대행사가 시장·경쟁사·키워드를 조사해\n반응 나올 주제부터 공략합니다.' },
      { label: '04', title: '한 화면 관제실', body: '발행 현황·예약·성과를 링크 하나로 확인.\n발행 완료와 주간 리포트는 텔레그램으로.' },
      { label: '정리', title: '월 800만원 어치를 대신합니다', body: '인건비 300 + 대행 5채널 500 + 내 시간 40시간.\n프로필 링크에서 소개서를 받아보세요.' },
    ],
    slideImages: [],
  },
  {
    id: 'reels-07-31', topic: 'ALWAYS ON · 가치 설득', format: '릴스', channels: ['instagram'],
    scheduledFor: at(31), score: 88, status: 'planned',
    kicker: 'ALWAYS ON', headline: 'SNS 대행 견적,<br>*받아보셨어요?*',
    sub: '5채널 대행 월 500만원+ — 시스템은 다르게 풉니다.',
    dayLabel: '금요일 · 릴스', motif: 'chart', variant: 'C', palette: 'ink',
    reelsScript:
      '[HOOK]\nSNS 대행 견적 받아보셨어요? 5채널이면 월 500부터입니다.\n\n[본론]\n직원을 뽑으면 월 300.\n직접 하면 내 시간이 월 40시간.\nALWAYS ON은 이 일을 자동화로 대신합니다.\n1년이면 콘텐츠 700개 —\n검색과 AI 추천에 쌓이는 브랜드 자산이에요.\n광고비처럼 사라지지 않습니다.\n\n[CTA]\n댓글에 "견적"이라고 남겨보세요.\n프로필 링크에도 소개서가 있습니다.',
    captionBody:
      'SNS 5채널 대행 견적, 받아보면 월 500만원부터 시작합니다. 직원을 뽑으면 월 300만원, 직접 하면 내 시간이 월 40시간씩 들어가요.\n\nALWAYS ON은 이 일을 자동화 시스템으로 대신합니다.\n\n조사·제작·발행·성과 학습이 매일 자동으로 돌고, 1년이면 콘텐츠 700개가 쌓입니다. 검색과 AI 추천에 남는 브랜드 자산이라, 광고비처럼 사라지지 않아요.\n\n월 고정비는 상담을 통해 브랜드에 맞게 산정됩니다.\n\n💬 댓글에 "견적"이라고 남기거나, 프로필 링크에서 소개서를 받아보세요.\n\n#ALWAYSON #얼웨이즈온 #SNS자동화 #SNS대행 #마케팅비용 #소상공인마케팅',
    captionNote: '비용 비교 훅 → 자동화 가치 환산 → 댓글 "견적" 인터랙션',
    rationale: '가격 프레이밍(대행 500 vs 시스템)으로 설득 + 리드 수집 CTA',
    slides: [], slideImages: [],
  },
];

const have = new Set(plan.items.map((i) => i.id));
let added = 0;
for (const it of NEW_ITEMS) {
  if (have.has(it.id)) { console.log(`- 이미 존재: ${it.id}`); continue; }
  plan.items.push(it); added++;
}
plan.updatedAt = now;
writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
console.log(`✓ plan.json — 다음 주 ${added}건 추가 (총 ${plan.items.length}건)`);
console.log('\n완료. 다음: render-cards / render-shorts → (CI에서 ffmpeg 합성) → dashboard');
