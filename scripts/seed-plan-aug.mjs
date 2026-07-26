#!/usr/bin/env node
/**
 * pslab 8월 1~2주 기획안 시드 — 콘텐츠 방향 전면 개편판
 *
 * 방향 근거: 새 홈페이지(pslab.ai.kr) + ALWAYS ON 솔루션 소개서.
 *  - 광고는 지출, 콘텐츠는 자산 (검색·AI가 손님을 데려온다)
 *  - 고객 여정 4단계(발견→검색→확신→단골)와 채널별 길목
 *  - SEO를 넘어 GEO(AI 추천 최적화) 선점
 *  - 발행 기록 = 신뢰 자산 (지속이 품질보다 먼저 무너진다)
 *  - 5채널 매일 운영은 구조의 문제 → 시스템·자동화로 푼다
 *
 * 인스타 캐러셀 6 + 스레드 4 + 구글블로그 2 + 네이버블로그 2 + 쇼츠 2 = 16건.
 * 멱등: 이미 존재하는 id는 건너뛴다. 카드/도표/쇼츠 이미지는 렌더러가 채운다.
 *
 * 사용: node scripts/seed-plan-aug.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date().toISOString();

// ── 1) 클라이언트 설정표 갱신 ─────────────────────────────────────────
const clientPath = join(ROOT, 'clients/pslab.json');
const client = JSON.parse(readFileSync(clientPath, 'utf8'));
client.industry = '온라인 컨설팅·광고대행 / SNS 채널 자동화 솔루션 ALWAYS ON 운영 (16년차 종합광고대행사 P.S.LAB)';
client.persona =
  '온라인 마케팅·컨설팅 대행사를 16년간 운영해 온 P.S.LAB(문제 해결 연구소) 대표. 수많은 광고 집행·브랜드 성장·실패를 직접 겪었고, 지금은 그 노하우를 담은 SNS 채널 자동화 솔루션 ALWAYS ON을 직접 운영한다. 교과서적 정의가 아니라 "실제로 해보니 이렇더라"를 1인칭으로 말하며, 광고비 중심 사고에서 콘텐츠 자산 중심 사고로의 전환을 돕는 사람';
client.brandTone =
  '16년차 실전 전문가의 시선으로 — 경험담은 진솔하게, 인사이트는 명확하고 단단하게. 과장 없이 신뢰감 있게. 콘텐츠 자산·지속의 힘을 일관되게 강조';
client.keywords = [
  '온라인마케팅', '마케팅인사이트', '광고대행', '퍼포먼스마케팅', '마케팅전략',
  '콘텐츠자산', 'SNS자동화', '콘텐츠마케팅', 'AI검색', 'GEO',
  '브랜딩', '사업이야기', '창업인사이트', '업계비하인드',
];
client.contentPillars = [
  '콘텐츠 자산론 (광고는 지출, 콘텐츠는 자산)',
  '고객 여정 4단계와 채널별 역할',
  'SEO·GEO — 검색과 AI 추천 시대의 노출 전략',
  '지속 발행 = 신뢰 (발행 기록이 브랜드 신용점수)',
  '채널 운영 시스템·자동화 (5채널을 혼자 감당하지 않는 법)',
  '실전 광고 운영 노하우·업계 비하인드',
];
writeFileSync(clientPath, JSON.stringify(client, null, 2) + '\n');
console.log('✓ clients/pslab.json 갱신');

// ── 2) 브랜드 브리프 갱신 ────────────────────────────────────────────
const briefPath = join(ROOT, 'data/clients/pslab/brand-brief.json');
const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
brief.analysis =
  '16년차 온라인 종합광고대행사 P.S.LAB(문제 해결 연구소). 퍼포먼스·브랜딩·콘텐츠 원스톱 운영 경험 위에, SNS 채널 자동화 솔루션 ALWAYS ON을 직접 개발·운영. 자기 채널이 곧 솔루션의 살아있는 증명이라는 점이 최대 강점.';
brief.direction =
  '광고비 인사이트 중심 → 콘텐츠 자산·지속의 힘 중심으로 전환. "광고는 끄면 끝, 콘텐츠는 남는다"를 축으로 고객 여정 4단계·GEO(AI 추천)·발행 기록=신뢰·운영 시스템화를 다룬다. 영업 멘트 대신 관점 전환을 돕는 실전 인사이트로 ALWAYS ON의 문제의식을 자연스럽게 심는다.';
brief.sensibility = '차분한 전문가 톤, 잉크 다크 + 오렌지 포인트, 이모지 최소화, 과장 금지';
brief.updatedAt = now;
brief.log = brief.log || [];
brief.log.push({
  at: now,
  field: 'direction',
  excerpt: '새 홈페이지(pslab.ai.kr)·ALWAYS ON 소개서 반영 — 콘텐츠 자산·고객여정·GEO·지속발행·시스템 축으로 전면 개편',
});
writeFileSync(briefPath, JSON.stringify(brief, null, 2) + '\n');
console.log('✓ brand-brief.json 갱신');

// ── 3) 8월 1~2주 기획안 ──────────────────────────────────────────────
const at = (d) => `2026-08-${String(d).padStart(2, '0')}T09:00:00.000Z`; // 18:00 KST

const CAROUSELS = [
  {
    id: 'aug-w1-mon', topic: '콘텐츠자산', scheduledFor: at(3), score: 90,
    kicker: 'Content Asset', headline: '광고는 끄면 끝,<br>콘텐츠는 *남습니다*',
    sub: '같은 100만원의 다른 운명 — 16년차가 광고비보다 먼저 챙기는 자산.',
    dayLabel: '월요일 · 콘텐츠 자산', motif: 'growth', variant: 'A',
    captionBody:
      '광고비 100만원과 콘텐츠 100만원, 운명이 다릅니다.\n\n광고는 결제가 멈추면 노출도 멈춥니다. 지출이에요.\n콘텐츠는 검색에 남아 1년 뒤에도 손님을 데려옵니다. 자산이에요.\n\n그리고 요즘은 보너스가 하나 더 붙습니다 — 손님이 챗봇에게 "추천해줘"라고 묻는 시대. AI는 콘텐츠가 쌓인 브랜드를 인용합니다.\n\n광고를 끊으라는 얘기가 아닙니다.\n광고로 "지금"을 사고, 콘텐츠로 "내일"을 쌓으세요.\n\n#콘텐츠마케팅 #온라인마케팅 #마케팅전략',
    slides: [
      { label: 'WHY', title: '같은 100만원, 다른 운명', body: '광고비는 끄는 순간 끝납니다.\n콘텐츠는 남아서 계속 손님을 데려옵니다.' },
      { label: '01', title: '광고 = 지출', body: '노출은 빌리는 것.\n결제가 멈추면 노출도 그 자리에서 멈춥니다.' },
      { label: '02', title: '콘텐츠 = 자산', body: '글과 영상은 검색에 남습니다.\n1년 전 글이 오늘도 손님을 데려와요.' },
      { label: '03', title: 'AI 시대의 보너스', body: '이제 손님은 챗봇에 "추천해줘"라고 묻습니다.\n콘텐츠가 쌓인 브랜드가 그 답변에 등장합니다.' },
      { label: '정리', title: '지금과 내일', body: '광고로 "지금"을 사고, 콘텐츠로 "내일"을 쌓으세요.\n둘은 대체재가 아니라 역할이 다른 겁니다.' },
    ],
  },
  {
    id: 'aug-w1-wed', topic: '고객여정', scheduledFor: at(5), score: 88,
    kicker: 'Customer Journey', headline: '손님이 단골이 되는<br>*4개의 길목*',
    sub: '발견→검색→확신→단골. 채널마다 지키는 길목이 다릅니다.',
    dayLabel: '수요일 · 전략', motif: 'compass', variant: 'B',
    captionBody:
      '손님은 한 번에 사지 않습니다. 발견 → 검색 → 확신 → 단골, 이 길목을 순서대로 지나가요.\n\n1. 발견 — 인스타·스레드에서 스쳐 지나가다 처음 봅니다.\n2. 검색 — 이름과 후기를 네이버·구글에 검색해 봅니다.\n3. 확신 — 유튜브와 발행 기록으로 믿을 만한지 살펴봅니다.\n4. 단골 — 피드 재노출로 잊히지 않아야 다시 옵니다.\n\n채널 하나를 잘하는 게 아니라, 길목 전부를 지키는 게 전략입니다.\n\n우리 브랜드는 지금 어느 길목이 비어 있나요?\n\n#마케팅전략 #브랜딩 #온라인마케팅',
    slides: [
      { label: 'WHY', title: '손님은 한 번에 사지 않는다', body: '발견 → 검색 → 확신 → 단골.\n이 여정의 길목마다 다른 채널이 일합니다.' },
      { label: '01', title: '발견', body: '인스타그램·스레드 — 스쳐 지나가다 처음 봅니다.\n첫 눈도장이 찍히는 길목.' },
      { label: '02', title: '검색', body: '네이버·구글 블로그 — 이름과 후기를 검색해 봅니다.\n검색의 답이 되어 있어야 하는 길목.' },
      { label: '03', title: '확신', body: '유튜브·발행 기록 — 믿을 만한지 살펴봅니다.\n꾸준함이 곧 신뢰가 되는 길목.' },
      { label: '04', title: '단골', body: '피드 재노출·소식 — 잊히지 않아야\n구매하고, 다시 찾아옵니다.' },
      { label: '정리', title: '길목 전부를 지켜라', body: '채널 하나가 아니라 여정 전체가 전략입니다.\n지금 어느 길목이 비어 있는지 점검하세요.' },
    ],
  },
  {
    id: 'aug-w1-fri', topic: 'AI검색', scheduledFor: at(7), score: 87,
    kicker: 'AI Search · GEO', headline: '요즘 손님은 검색 대신<br>*AI에게 묻습니다*',
    sub: '챗봇이 추천하는 브랜드가 되는 법 — GEO 이야기.',
    dayLabel: '금요일 · 트렌드', motif: 'bulb', variant: 'C',
    captionBody:
      '"강남 맛집 추천해줘" — 검색창이 아니라 챗봇에게 묻는 손님이 늘고 있습니다.\n\n검색 시대의 SEO처럼, AI 시대엔 GEO(AI 추천 최적화)가 노출을 정합니다.\n\nAI는 무엇을 인용할까요? 여러 채널에 일관된 메시지로 꾸준히 쌓인 콘텐츠입니다. 출처가 많은 브랜드가 더 자주 추천돼요.\n\n이건 하루아침에 살 수 없습니다. 광고비로도 못 사요.\n먼저 쌓은 브랜드가 검색과 AI 시대를 함께 선점합니다.\n\n#AI검색 #GEO #콘텐츠마케팅 #온라인시장트렌드',
    slides: [
      { label: 'WHY', title: '검색창 대신 챗봇', body: '"OO 추천해줘" — 손님의 질문이\n검색창에서 AI 챗봇으로 옮겨가고 있습니다.' },
      { label: '01', title: 'SEO에서 GEO로', body: '검색 노출을 넘어, AI 답변에 인용되는 것.\n그게 AI 시대의 새 노출입니다.' },
      { label: '02', title: 'AI는 무엇을 인용하나', body: '여러 채널에 일관되게 쌓인 콘텐츠.\n출처가 많은 브랜드가 더 자주 추천됩니다.' },
      { label: '03', title: '광고비로 못 사는 것', body: '추천은 하루아침에 살 수 없습니다.\n쌓는 데 시간이 드는 만큼, 먼저 쌓는 쪽이 이깁니다.' },
      { label: '정리', title: '선점의 게임', body: '먼저 콘텐츠를 쌓은 브랜드가\n검색과 AI 시대를 함께 선점합니다.' },
    ],
  },
  {
    id: 'aug-w2-mon', topic: '지속발행', scheduledFor: at(10), score: 89,
    kicker: 'Consistency', headline: '3주 멈춘 SNS가<br>손님에게 보내는 *신호*',
    sub: '발행 기록은 손님이 보는 브랜드 신용점수입니다.',
    dayLabel: '월요일 · 신뢰', motif: 'chart', variant: 'A',
    captionBody:
      '손님은 구매 전에 피드부터 봅니다. 마지막 게시물이 3주 전이라면 어떤 신호일까요?\n\n"여기 장사 안 되나?" — 확신의 길목에서 조용히 이탈합니다.\n\n반대로 매일 쌓인 발행 기록은 그 자체로 "살아있는 가게"라는 증명이에요. 알고리즘도 같습니다. 규칙적으로 발행하는 계정에 노출 우선권을 줍니다.\n\n몰아서 10개보다 매일 1개가 이깁니다.\n콘텐츠의 질보다 먼저 무너지는 게 "지속"이에요. 지속 가능한 구조부터 만드세요.\n\n#SNS마케팅 #브랜딩 #마케팅인사이트',
    slides: [
      { label: 'WHY', title: '손님은 피드부터 본다', body: '구매 전 프로필을 확인합니다.\n마지막 게시물이 3주 전이라면?' },
      { label: '01', title: '방치의 비용', body: '"여기 장사 안 되나?"\n확신의 길목에서 손님이 조용히 이탈합니다.' },
      { label: '02', title: '꾸준함 = 신뢰', body: '매일 쌓인 발행 기록은 그 자체로\n"살아있는 가게"라는 증명입니다.' },
      { label: '03', title: '알고리즘도 같다', body: '규칙적으로 발행하는 계정에 노출 우선권.\n몰아서 10개보다 매일 1개가 이깁니다.' },
      { label: '정리', title: '지속이 먼저 무너진다', body: '콘텐츠의 질보다 먼저 무너지는 게 지속입니다.\n의지가 아니라 지속 가능한 구조를 만드세요.' },
    ],
  },
  {
    id: 'aug-w2-wed', topic: '채널운영시스템', scheduledFor: at(12), score: 88,
    kicker: 'System', headline: '5개 채널 매일 운영,<br>혼자서는 *무리입니다*',
    sub: '의지의 문제가 아니라 구조의 문제입니다.',
    dayLabel: '수요일 · 운영', motif: 'branch', variant: 'B',
    captionBody:
      '채널 5곳에 매일 올리는 일은, 매일 아침 가게 문 5개를 혼자 여는 것과 같습니다.\n\n그래서 대부분 셋 중 하나가 돼요.\n하나 — 사람을 씁니다. 매달 수백만 원이 고정으로 나갑니다.\n둘 — 며칠 하다 멈춥니다. 채널은 몇 주째 방치됩니다.\n셋 — 시작을 못 합니다. 경쟁사가 앞서가는 걸 지켜만 봅니다.\n\n16년 해보니, 이건 의지의 문제가 아니라 구조의 문제입니다.\n사람은 방향을 잡고, 반복은 시스템에 맡기세요. 자동화가 대체하는 건 창의력이 아니라 반복입니다.\n\n#SNS자동화 #사업이야기 #마케팅전략',
    slides: [
      { label: 'WHY', title: '가게 문 5개를 혼자 여는 일', body: '채널 5곳에 매일 올리는 일은\n매일 아침 문 5개를 혼자 여는 것과 같습니다.' },
      { label: '01', title: '현실의 세 갈래', body: '사람을 쓴다 — 매달 수백만 원 고정.\n며칠 하다 멈춘다. 혹은 시작을 못 한다.' },
      { label: '02', title: '의지의 문제가 아니다', body: '본업을 하면서 조사·제작·발행·분석을\n매일 반복하는 건 구조적으로 무리입니다.' },
      { label: '03', title: '답은 시스템', body: '사람은 방향을 잡고, 반복은 시스템에.\n자동화가 대체하는 건 창의력이 아니라 반복입니다.' },
      { label: '정리', title: '"누가 매일 하나"를 풀어라', body: '이 질문을 풀어야 채널이 굴러갑니다.\n구조를 바꾸면 지속은 따라옵니다.' },
    ],
  },
  {
    id: 'aug-w2-fri', topic: '콘텐츠비용', scheduledFor: at(14), score: 86,
    kicker: 'Cost Math', headline: '콘텐츠 1개의 *진짜 값*,<br>계산해 보셨나요?',
    sub: '감으로는 싸 보이고, 계산하면 비쌉니다.',
    dayLabel: '금요일 · 의사결정', motif: 'chart', variant: 'C',
    captionBody:
      '콘텐츠 1개 만드는 값, 계산해 보셨나요?\n\n직접 하면 — 기획 1시간 + 제작 2시간 + 발행·분석 1시간. 사장님 시간값을 시급 2만원으로만 잡아도 개당 8만원입니다.\n전담 직원을 쓰면 월 300만원, 대행에 5채널을 맡기면 월 500만원이 넘어갑니다.\n\n그래서 콘텐츠는 "많이 만들기"가 아니라 "지속 가능한 단가 만들기" 게임이에요.\n\n반복 구간(제작·발행·정리)을 시스템에 넘기고 사람은 방향 판단만 하면, 개당 단가는 급격히 내려갑니다.\n\n#콘텐츠마케팅 #사업이야기 #마케팅전략',
    slides: [
      { label: 'WHY', title: '감으로는 싸고, 계산하면 비싸다', body: '콘텐츠 1개의 원가를\n한 번이라도 계산해 보셨나요?' },
      { label: '01', title: '직접 하면', body: '기획 1시간 + 제작 2시간 + 발행·분석 1시간.\n시급 2만원으로만 잡아도 개당 8만원.' },
      { label: '02', title: '사람을 쓰면', body: '전담 직원 월 300만원.\n대행 5채널이면 월 500만원+.' },
      { label: '03', title: '시스템에 넘기면', body: '반복 구간은 자동화하고 사람은 방향 판단만.\n개당 단가가 급격히 내려갑니다.' },
      { label: '정리', title: '단가의 게임', body: '콘텐츠는 "많이"가 아니라\n"지속 가능한 단가"의 게임입니다.' },
    ],
  },
];

const THREADS = [
  {
    id: 'threads-08-04', topic: '콘텐츠자산', scheduledFor: at(4), score: 78,
    kicker: 'Threads', headline: '광고는 지출,<br>*콘텐츠는 자산*', sub: '같은 돈의 다른 운명.', motif: 'growth', variant: 'A',
    captionBody:
      '광고비 100만원과 콘텐츠 100만원의 차이 🧵\n\n광고는 끄는 순간 끝납니다.\n콘텐츠는 1년 뒤에도 검색으로 손님을 데려와요.\n\n광고로 "지금"을 사고, 콘텐츠로 "내일"을 쌓으세요.',
  },
  {
    id: 'threads-08-06', topic: 'AI검색', scheduledFor: at(6), score: 77,
    kicker: 'Threads', headline: '손님은 이제<br>*AI에게 묻는다*', sub: 'GEO의 시대.', motif: 'bulb', variant: 'B',
    captionBody:
      '요즘 손님들, 검색창보다 먼저 챗봇에 물어봅니다. "OO 추천해줘."\n\nAI는 콘텐츠가 쌓인 브랜드를 인용해요.\n\n검색 시대의 SEO처럼, AI 시대엔 GEO.\n먼저 쌓는 쪽이 선점합니다.',
  },
  {
    id: 'threads-08-11', topic: '지속발행', scheduledFor: at(11), score: 76,
    kicker: 'Threads', headline: '3주 멈춘 계정은<br>*닫힌 가게*', sub: '피드가 보내는 신호.', motif: 'lock', variant: 'C',
    captionBody:
      '마지막 게시물이 3주 전인 계정, 손님 눈엔 "닫힌 가게"로 보입니다.\n\n콘텐츠의 질보다 먼저 무너지는 게 지속이에요.\n\n몰아서 10개보다 매일 1개가 이깁니다.',
  },
  {
    id: 'threads-08-13', topic: '콘텐츠자산', scheduledFor: at(13), score: 76,
    kicker: 'Threads', headline: '하루치가 아니라<br>*1년치의 복리*', sub: '콘텐츠는 복리로 일한다.', motif: 'growth', variant: 'A',
    captionBody:
      '하루치 콘텐츠는 아무것도 아닙니다.\n\n그런데 1년이면 700개.\n검색에 걸리는 페이지 700개, AI가 인용할 출처 700개.\n\n콘텐츠는 복리로 일합니다.',
  },
];

const BLOGGERS = [
  {
    id: 'blogger-08-05', scheduledFor: at(5), score: 84,
    topic: 'AI 검색 시대, 챗봇이 내 브랜드를 추천하게 만드는 법 (GEO 입문)',
    kicker: 'AI Search', headline: 'AI 검색 시대, 챗봇이 내 브랜드를 추천하게 만드는 법 (GEO 입문)',
    sub: '손님의 질문이 검색창에서 챗봇으로 옮겨가고 있습니다. AI 답변에 인용되는 브랜드가 되는 조건을 정리했습니다.',
    dayLabel: '구글 블로그', motif: 'bulb', variant: 'A',
    tags: ['GEO', 'AI검색', 'SEO', '콘텐츠마케팅'],
    captionBody:
      '# AI 검색 시대, 챗봇이 내 브랜드를 추천하게 만드는 법 (GEO 입문)\n> [핵심 요약] 손님의 질문이 검색창에서 챗봇으로 옮겨가고 있습니다. AI 답변에 인용되는 브랜드가 되는 조건 — 일관된 메시지, 꾸준한 발행, 질문에 답하는 콘텐츠 — 를 정리했습니다.\n\n"OO 추천해줘." 요즘 손님은 검색창 대신 챗봇에게 묻습니다. 16년간 검색 마케팅을 해온 입장에서, 지금 일어나는 변화는 키워드 광고가 처음 나왔을 때만큼 큽니다.\n\n## 손님의 동선이 바뀌었다\n지금까지는 검색 → 클릭 → 비교의 동선이었습니다. 이제는 챗봇에게 물어보고, AI가 추천한 두세 개 중에서 고릅니다. 추천 목록에 없는 브랜드는 비교 대상조차 되지 못해요.\n![손님의 동선이 바뀌었다](https://leejiho-pslab.github.io/pslab/blog/blogger-08-05/fig-1.png)\n\n## GEO — AI 답변에 인용되는 최적화\n검색 시대의 SEO가 "검색 결과 상위"를 노렸다면, GEO(Generative Engine Optimization)는 "AI 답변에 인용되는 것"을 노립니다. 광고비로 살 수 없다는 점이 핵심입니다. AI는 광고를 읽는 게 아니라 콘텐츠를 읽으니까요.\n![GEO — AI 답변에 인용되는 최적화](https://leejiho-pslab.github.io/pslab/blog/blogger-08-05/fig-2.png)\n\n## AI가 인용하는 브랜드의 공통점\n여러 채널에 일관된 메시지가 쌓여 있고, 발행이 꾸준하며, 손님의 질문에 실제로 답하는 정보성 콘텐츠가 많은 브랜드입니다. 출처가 많을수록 AI가 신뢰할 근거도 많아집니다.\n![AI가 인용하는 브랜드의 공통점](https://leejiho-pslab.github.io/pslab/blog/blogger-08-05/fig-3.png)\n\n## 오늘 시작하는 실행 순서\n채널을 정리하고, 핵심 메시지를 통일하고, 주기적으로 발행하고, 무엇이 인용되는지 확인하는 순서입니다. 거창한 것보다 "멈추지 않는 구조"를 먼저 만드세요. 쌓이는 데 시간이 드는 만큼, 먼저 시작한 쪽이 유리합니다.\n![오늘 시작하는 실행 순서](https://leejiho-pslab.github.io/pslab/blog/blogger-08-05/fig-4.png)\n\n## 자주 묻는 질문\n**Q. 작은 브랜드도 GEO가 의미 있나요?**\n오히려 유리합니다. 대형 브랜드보다 좁은 주제를 깊게 다룰 수 있어, 특정 질문에서는 더 자주 인용됩니다.\n\n**Q. 광고는 이제 필요 없나요?**\n아닙니다. 광고는 "지금"의 매출을, 콘텐츠는 "내일"의 추천을 만듭니다. 역할이 다릅니다.\n\n검색과 AI 시대의 노출은 결국 같은 원리입니다 — 꾸준히 쌓은 브랜드가 선점합니다.\n\n🔖 태그: #GEO #AI검색 #SEO #콘텐츠마케팅',
  },
  {
    id: 'blogger-08-12', scheduledFor: at(12), score: 83,
    topic: '콘텐츠 마케팅 비용 계산법 — 광고비와 무엇이 다른가',
    kicker: 'Cost Math', headline: '콘텐츠 마케팅 비용 계산법 — 광고비와 무엇이 다른가',
    sub: '광고는 지출, 콘텐츠는 자산입니다. 콘텐츠 1개의 원가와 손익분기를 숫자로 따져봤습니다.',
    dayLabel: '구글 블로그', motif: 'chart', variant: 'A',
    tags: ['콘텐츠마케팅', '마케팅예산', '콘텐츠비용', '광고비'],
    captionBody:
      '# 콘텐츠 마케팅 비용 계산법 — 광고비와 무엇이 다른가\n> [핵심 요약] 광고는 끄면 끝나는 지출, 콘텐츠는 남아서 일하는 자산입니다. 콘텐츠 1개의 원가를 계산하고, 지속 가능한 단가를 만드는 법을 정리했습니다.\n\n"콘텐츠 마케팅은 공짜 아닌가요?" — 아닙니다. 계산해 보면 생각보다 비쌉니다. 다만 광고비와는 돈의 성격이 다릅니다.\n\n## 광고는 지출, 콘텐츠는 자산\n광고는 결제가 멈추면 노출도 멈춥니다. 콘텐츠는 발행한 뒤에도 검색과 AI 추천으로 계속 유입을 만듭니다. 회계로 치면 광고는 비용, 콘텐츠는 감가상각이 거의 없는 자산에 가깝습니다.\n![광고는 지출, 콘텐츠는 자산](https://leejiho-pslab.github.io/pslab/blog/blogger-08-12/fig-1.png)\n\n## 콘텐츠 1개의 원가 계산\n직접 만들면 기획·제작·발행·분석에 약 4시간 — 시급 2만원으로만 환산해도 개당 8만원입니다. 전담 인력은 월 300만원, 5채널 대행은 월 500만원 이상. "공짜"라는 감각은 사장님 시간값을 0원으로 치기 때문에 생깁니다.\n![콘텐츠 1개의 원가 계산](https://leejiho-pslab.github.io/pslab/blog/blogger-08-12/fig-2.png)\n\n## 손익분기 — 콘텐츠가 광고를 이기는 시점\n광고 유입은 집행 기간에 비례하고, 콘텐츠 유입은 누적량에 비례합니다. 발행이 쌓일수록 콘텐츠의 개당 유입 단가는 계속 내려가고, 어느 시점부터 광고 클릭 단가보다 싸집니다. 단, 이 곡선은 "멈추지 않았을 때"만 그려집니다.\n![손익분기 — 콘텐츠가 광고를 이기는 시점](https://leejiho-pslab.github.io/pslab/blog/blogger-08-12/fig-3.png)\n\n## 지속 가능한 단가 만드는 법\n반복 구간(초안·이미지·발행·리포트)을 시스템과 자동화에 넘기고, 사람은 방향 판단과 검수만 맡는 구조입니다. 콘텐츠 마케팅의 승부처는 "얼마나 잘 만드나"보다 "얼마나 오래 지속하나"에 있고, 지속은 단가가 결정합니다.\n![지속 가능한 단가 만드는 법](https://leejiho-pslab.github.io/pslab/blog/blogger-08-12/fig-4.png)\n\n## 자주 묻는 질문\n**Q. 광고를 끊고 콘텐츠만 해도 되나요?**\n권하지 않습니다. 광고는 "지금"의 매출을 만듭니다. 광고로 현재를 사고 콘텐츠로 미래를 쌓는 병행이 정석입니다.\n\n**Q. 효과가 나올 때까지 얼마나 걸리나요?**\n채널과 주제에 따라 다르지만, 분기 단위로 보세요. 한 달 만에 판단하면 대부분 "효과 없음"으로 끝납니다.\n\n오늘 콘텐츠 1개의 원가부터 계산해 보세요. 숫자가 나오면, 무엇을 시스템에 넘겨야 할지도 보입니다.\n\n🔖 태그: #콘텐츠마케팅 #마케팅예산 #콘텐츠비용 #광고비',
  },
];

const NAVERS = [
  {
    id: 'naver-blog-08-06', scheduledFor: at(6), score: 84,
    topic: '네이버 블로그 상위노출, 2026년엔 꾸준함이 지수입니다',
    kicker: 'Naver SEO', headline: '네이버 블로그 상위노출, 2026년엔 꾸준함이 지수입니다',
    sub: '블로그 지수의 실체는 신뢰 누적입니다. 몰아쓰기보다 규칙적인 발행 루틴이 상위노출을 만듭니다.',
    dayLabel: '네이버 블로그', motif: 'chart', variant: 'A',
    tags: ['네이버블로그', '블로그지수', '상위노출', '블로그SEO'],
    captionBody:
      '# 네이버 블로그 상위노출, 2026년엔 꾸준함이 지수입니다\n> [핵심 요약] 블로그 지수의 실체는 "이 블로그를 믿어도 되는가"의 누적 기록입니다. 몰아쓰기·복붙으로는 오르지 않고, 규칙적인 발행 루틴이 상위노출을 만듭니다.\n\n"블로그 지수 올리는 비법 있나요?" 16년간 검색 마케팅을 하며 가장 많이 받은 질문 중 하나입니다. 결론부터 말하면 — 비법은 없고, 원리는 있습니다.\n\n## 블로그 지수의 실체\n네이버가 공식 공개한 "지수"는 없습니다. 하지만 검색 알고리즘이 보는 건 분명합니다 — 이 블로그가 주제에 전문성이 있는가, 활동이 꾸준한가, 독자가 실제로 읽는가. 한마디로 신뢰의 누적 기록입니다.\n![블로그 지수의 실체](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-06/fig-1.png)\n\n## 왜 꾸준함이 이기는가\n같은 품질이라면, 매주 2편씩 1년을 쌓은 블로그가 한 달에 20편 몰아 쓴 블로그를 이깁니다. 알고리즘은 "앞으로도 좋은 글이 올라올 블로그"를 상위에 두고 싶어 하고, 그 예측의 근거가 과거의 규칙성이기 때문입니다.\n![왜 꾸준함이 이기는가](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-06/fig-2.png)\n\n## 상위노출을 만드는 발행 루틴\n주제 폭은 좁히고, 주기는 규칙적으로, 검색자의 질문에 답하는 구조(제목-요약-소제목)로 씁니다. 하루 3편 몰아쓰기보다 주 2편을 6개월 지속하는 편이 지수에도, 사람 눈에도 좋습니다.\n![상위노출을 만드는 발행 루틴](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-06/fig-3.png)\n\n## 방치된 블로그 살리는 순서\n오래 멈춘 블로그도 살아납니다. 주제를 한 갈래로 정리하고, 낮은 빈도라도 규칙적으로 재개하고, 반응 있는 주제로 좁혀가세요. 리셋이 아니라 재가동이 답입니다.\n![방치된 블로그 살리는 순서](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-06/fig-4.png)\n\n## 자주 묻는 질문\n**Q. 하루에 몇 편이 적당한가요?**\n편수보다 규칙성입니다. 주 2편을 정했다면 그 리듬을 6개월 지키는 게 하루 3편보다 낫습니다.\n\n**Q. 저품질에 걸리면 끝인가요?**\n대부분 "저품질"이 아니라 주제 산만·검색 수요 없음이 원인입니다. 주제를 좁히고 규칙성을 회복하면 돌아옵니다.\n\n비법을 찾는 시간에 리듬을 만드세요. 2026년의 블로그 지수는 결국 꾸준함입니다.\n\n🔖 태그: #네이버블로그 #블로그지수 #상위노출 #블로그SEO',
  },
  {
    id: 'naver-blog-08-13', scheduledFor: at(13), score: 83,
    topic: '사장님 혼자 SNS 5개 채널, 현실적인 운영법',
    kicker: 'Operation', headline: '사장님 혼자 SNS 5개 채널, 현실적인 운영법',
    sub: '의지로 버티는 운영은 반드시 멈춥니다. 채널별 역할 정리와 최소 시스템으로 지속 구조를 만드는 법.',
    dayLabel: '네이버 블로그', motif: 'branch', variant: 'A',
    tags: ['SNS운영', 'SNS마케팅', '소상공인마케팅', 'SNS자동화'],
    captionBody:
      '# 사장님 혼자 SNS 5개 채널, 현실적인 운영법\n> [핵심 요약] 5채널 매일 운영이 멈추는 건 의지가 아니라 구조의 문제입니다. 채널별 역할을 정하고, 반복 구간을 시스템에 넘기는 최소 구조를 정리했습니다.\n\n인스타·블로그·유튜브·스레드까지 "다 해야 한다"는 건 알겠는데, 몸이 하나입니다. 16년간 수많은 사장님들을 보며 확인한 건 — 멈추는 이유는 게을러서가 아니라 구조가 없어서입니다.\n\n## 왜 다들 멈추는가\n본업을 하면서 매일 조사·제작·발행·분석을 반복하는 건 구조적으로 무리입니다. 그래서 대부분 셋 중 하나가 됩니다 — 사람을 쓰거나(월 수백만 원 고정), 며칠 하다 멈추거나, 아예 시작을 못 하거나.\n![왜 다들 멈추는가](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-13/fig-1.png)\n\n## 채널별 역할부터 정한다\n손님은 발견(인스타·스레드) → 검색(네이버·구글 블로그) → 확신(유튜브·발행 기록) → 단골(재노출)의 길목을 지나갑니다. 다섯 채널에 같은 걸 올리는 게 아니라, 길목마다 다른 역할을 주는 게 먼저입니다.\n![채널별 역할부터 정한다](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-13/fig-2.png)\n\n## 혼자서도 돌아가는 최소 시스템\n핵심은 원소스 멀티유즈입니다. 하나의 소재를 캐러셀·블로그 글·쇼츠·스레드로 변주하면 제작량이 1/5로 줄어듭니다. 발행 시각을 고정하고, 주 단위로 몰아서 기획하고, 발행은 예약으로 처리하세요.\n![혼자서도 돌아가는 최소 시스템](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-13/fig-3.png)\n\n## 자동화로 넘길 것과 직접 할 것\n반복 구간 — 초안 작성, 이미지 제작, 예약 발행, 성과 정리 — 는 자동화 도구에 넘길 수 있습니다. 사람이 계속 쥐고 있어야 하는 건 방향 판단과 검수입니다. 이 분담이 되면 하루 10분 검수로 5채널이 돌아가는 구조도 가능합니다.\n![자동화로 넘길 것과 직접 할 것](https://leejiho-pslab.github.io/pslab/blog/naver-blog-08-13/fig-4.png)\n\n## 자주 묻는 질문\n**Q. 다섯 채널을 다 해야 하나요?**\n아니요. 우리 손님이 지나는 길목 두세 개부터 시작하세요. 다만 "발견"과 "검색" 길목은 비워두지 않는 걸 권합니다.\n\n**Q. 자동화하면 티가 나지 않나요?**\n방향과 검수를 사람이 쥐고 있으면 티가 나는 건 "꾸준함"뿐입니다. 그게 목적이고요.\n\n의지로 버티지 말고 구조를 만드세요. 지속되는 채널은 예외 없이 구조가 있습니다.\n\n🔖 태그: #SNS운영 #SNS마케팅 #소상공인마케팅 #SNS자동화',
  },
];

const YOUTUBES = [
  {
    id: 'youtube-08-07', topic: '콘텐츠자산', scheduledFor: at(7), score: 80,
    kicker: 'Shorts', headline: '광고 끄면 매출도<br>*꺼지는 이유*', sub: '지출과 자산의 차이.',
    dayLabel: '유튜브 · 쇼츠', motif: 'growth', variant: 'A',
    captionBody:
      '[HOOK]\n광고를 끄면 매출도 같이 꺼지는 사장님, 이유는 하나예요.\n\n[본론]\n광고는 지출이라 끄는 순간 노출이 멈춥니다.\n콘텐츠는 자산이라 1년 전 글이 오늘도 손님을 데려와요.\n요즘은 AI까지 콘텐츠 쌓인 브랜드를 추천합니다.\n광고만 있는 브랜드는 이 흐름에서 빠져요.\n\n[CTA]\n광고로 지금을 사고, 콘텐츠로 내일을 쌓으세요.',
    ytTitle: '광고 끄면 매출도 꺼지는 이유｜광고는 지출, 콘텐츠는 자산 #shorts',
    ytDescription:
      '광고는 끄는 순간 노출이 멈추는 지출, 콘텐츠는 1년 뒤에도 손님을 데려오는 자산입니다. AI 추천 시대엔 이 차이가 더 커집니다.\n\n✅ 광고 = 지출: 결제가 멈추면 노출도 멈춤\n✅ 콘텐츠 = 자산: 검색·AI 추천에 남아 계속 유입\n✅ 병행 전략: 광고로 지금을, 콘텐츠로 내일을\n\n광고비 의존이 고민인 사장님, 콘텐츠 자산을 시작하고 싶은 분께.\n\n📌 콘텐츠 자산 만드는 법 → @_pslab\n👍 도움이 됐다면 구독!\n\n#콘텐츠마케팅 #광고비 #온라인마케팅 #콘텐츠자산 #AI검색 #GEO #마케팅전략 #자영업 #shorts',
    ytTags: ['콘텐츠 마케팅', '광고비', '콘텐츠 자산', '온라인마케팅', 'AI 검색', 'GEO', '마케팅 전략', '자영업 마케팅', 'SNS 마케팅', '브랜딩'],
  },
  {
    id: 'youtube-08-14', topic: '고객여정', scheduledFor: at(14), score: 79,
    kicker: 'Shorts', headline: '손님이 단골 되는<br>*4단계*', sub: '길목마다 채널이 다르다.',
    dayLabel: '유튜브 · 쇼츠', motif: 'compass', variant: 'B',
    captionBody:
      '[HOOK]\n손님은 한 번에 안 삽니다. 네 번의 길목을 지나요.\n\n[본론]\n1. 발견 — 인스타·스레드에서 처음 봅니다.\n2. 검색 — 네이버·구글에 이름을 검색해요.\n3. 확신 — 유튜브랑 발행 기록으로 믿을지 정합니다.\n4. 단골 — 잊히지 않아야 다시 옵니다.\n채널 하나만 잘해선 길목이 뚫려요.\n\n[CTA]\n우리 브랜드, 어느 길목이 비어 있나요?',
    ytTitle: '손님이 단골 되는 4단계｜채널마다 지키는 길목이 다릅니다 #shorts',
    ytDescription:
      '손님은 발견 → 검색 → 확신 → 단골의 여정을 지나갑니다. 채널 하나가 아니라 길목 전체를 지키는 게 전략입니다.\n\n✅ 발견: 인스타그램·스레드 — 첫 눈도장\n✅ 검색: 네이버·구글 블로그 — 검색의 답\n✅ 확신: 유튜브·발행 기록 — 꾸준함이 신뢰\n✅ 단골: 재노출 — 잊히지 않기\n\nSNS 채널 전략이 고민인 사장님, 어디부터 시작할지 모르겠는 분께.\n\n📌 채널 전략 인사이트 → @_pslab\n👍 도움이 됐다면 구독!\n\n#고객여정 #SNS마케팅 #채널전략 #온라인마케팅 #브랜딩 #마케팅전략 #자영업 #shorts',
    ytTags: ['고객 여정', 'SNS 마케팅', '채널 전략', '온라인마케팅', '브랜딩', '마케팅 전략', '자영업 마케팅', '단골 만들기', '인스타그램 마케팅', '네이버 블로그'],
  },
];

function toItem(x, format, channels, extra = {}) {
  return {
    id: x.id, topic: x.topic, format, channels,
    scheduledFor: x.scheduledFor, score: x.score, status: 'planned',
    kicker: x.kicker, headline: x.headline, sub: x.sub,
    dayLabel: x.dayLabel || extra.dayLabel, motif: x.motif, variant: x.variant, palette: 'ink',
    captionBody: x.captionBody, captionNote: x.sub, rationale: x.sub,
    slides: x.slides || [], slideImages: [],
    ...(x.tags ? { tags: x.tags } : {}),
    ...(x.ytTitle ? { ytTitle: x.ytTitle, ytDescription: x.ytDescription, ytTags: x.ytTags } : {}),
  };
}

const newItems = [
  ...CAROUSELS.map((x) => toItem(x, '카드뉴스', ['instagram'])),
  ...THREADS.map((x) => toItem(x, '스레드(타래)', ['threads'], { dayLabel: '스레드 · 타래' })),
  ...BLOGGERS.map((x) => toItem(x, 'blogger', ['blogger'])),
  ...NAVERS.map((x) => toItem(x, 'naver-blog', ['naver-blog'])),
  ...YOUTUBES.map((x) => toItem(x, '쇼츠 대본', ['youtube'])),
];

const planPath = join(ROOT, 'data/clients/pslab/plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const have = new Set(plan.items.map((i) => i.id));
let added = 0;
for (const it of newItems) {
  if (have.has(it.id)) { console.log(`- 이미 존재: ${it.id} (건너뜀)`); continue; }
  plan.items.push(it); added++;
}
plan.updatedAt = now;
writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
console.log(`✓ plan.json — 신규 ${added}건 추가 (총 ${plan.items.length}건)`);

// ── 4) 블로그 도표 스펙 ──────────────────────────────────────────────
const FIGS = [
  {
    id: 'blogger-08-05', channel: 'blogger',
    figures: [
      { type: 'compare', kicker: 'Shift', title: '손님의 동선이 바뀌었다', left: { label: '검색 시대', items: ['키워드 검색', '결과 목록 클릭', '여러 곳 비교'] }, right: { label: 'AI 시대', items: ['챗봇에게 질문', 'AI가 2~3곳 추천', '추천 안에서 선택'] } },
      { type: 'quote', kicker: 'GEO', text: 'AI 추천은 광고비로 살 수 없다. AI는 광고가 아니라 콘텐츠를 읽는다.', by: '16년차 검색 마케터의 결론' },
      { type: 'checklist', kicker: 'Cited', title: 'AI가 인용하는 브랜드의 공통점', items: ['여러 채널에 일관된 메시지', '멈추지 않는 발행 기록', '질문에 답하는 정보성 콘텐츠', '출처로 삼을 만한 누적량'] },
      { type: 'steps', kicker: 'Action', title: '오늘 시작하는 GEO 실행 순서', steps: [{ label: '채널 정리', desc: '길목별 역할 정의' }, { label: '핵심 메시지 통일', desc: '어느 채널이든 같은 답' }, { label: '주기적 발행', desc: '멈추지 않는 구조 만들기' }, { label: '인용 확인', desc: 'AI에게 직접 물어보기' }] },
    ],
  },
  {
    id: 'blogger-08-12', channel: 'blogger',
    figures: [
      { type: 'compare', kicker: 'Money', title: '광고는 지출, 콘텐츠는 자산', left: { label: '광고', items: ['끄면 노출 종료', '기간에 비례', '남는 것 없음'] }, right: { label: '콘텐츠', items: ['발행 후에도 유입', '누적량에 비례', '검색·AI에 남음'] } },
      { type: 'bars', kicker: 'Cost', title: '콘텐츠 확보 방식별 월 비용', bars: [{ label: '직접 제작(주3회)', pct: 20, val: '약 100만원' }, { label: '전담 직원 1명', pct: 60, val: '약 300만원' }, { label: '대행 5채널', pct: 100, val: '500만원+' }] },
      { type: 'quote', kicker: 'BEP', text: '콘텐츠의 유입 단가는 쌓일수록 내려간다. 단, 멈추지 않았을 때만.', by: '콘텐츠 손익분기의 조건' },
      { type: 'steps', kicker: 'Structure', title: '지속 가능한 단가 만드는 법', steps: [{ label: '반복 구간 분리', desc: '초안·이미지·발행·리포트' }, { label: '시스템·자동화에 위임', desc: '반복은 기계의 일' }, { label: '사람은 방향·검수', desc: '판단만 남기기' }] },
    ],
  },
  {
    id: 'naver-blog-08-06', channel: 'naver-blog',
    figures: [
      { type: 'checklist', kicker: 'Index', title: '알고리즘이 보는 신뢰의 신호', items: ['주제의 전문성 (한 우물)', '활동의 규칙성 (꾸준한 발행)', '독자의 반응 (체류·공감)', '검색 질문에 답하는 구조'] },
      { type: 'compare', kicker: 'Why', title: '몰아쓰기 vs 꾸준함', left: { label: '한 달 20편 몰아쓰기', items: ['활동 예측 불가', '품질 편차 큼', '지수 정체'] }, right: { label: '주 2편 × 1년', items: ['규칙성 = 신뢰', '품질 일정', '지수 우상향'] } },
      { type: 'steps', kicker: 'Routine', title: '상위노출을 만드는 발행 루틴', steps: [{ label: '주제 폭 좁히기', desc: '한 갈래 전문성' }, { label: '주기 고정', desc: '주 2편이면 6개월 유지' }, { label: '질문에 답하는 구조', desc: '제목-요약-소제목' }] },
      { type: 'steps', kicker: 'Revive', title: '방치된 블로그 살리는 순서', steps: [{ label: '주제 한 갈래로 정리', desc: '산만함 제거' }, { label: '낮은 빈도로 재개', desc: '규칙성부터 회복' }, { label: '반응 주제로 좁히기', desc: '데이터로 방향 조정' }] },
    ],
  },
  {
    id: 'naver-blog-08-13', channel: 'naver-blog',
    figures: [
      { type: 'bars', kicker: 'Reality', title: '5채널 운영의 세 갈래', bars: [{ label: '사람을 쓴다', pct: 100, val: '월 수백만원' }, { label: '며칠 하다 멈춘다', pct: 70, val: '가장 흔함' }, { label: '시작을 못 한다', pct: 50, val: '기회비용' }] },
      { type: 'steps', kicker: 'Journey', title: '손님이 지나는 4개의 길목', steps: [{ label: '발견', desc: '인스타·스레드 — 첫 눈도장' }, { label: '검색', desc: '네이버·구글 블로그 — 검색의 답' }, { label: '확신', desc: '유튜브·발행 기록 — 신뢰' }, { label: '단골', desc: '재노출 — 잊히지 않기' }] },
      { type: 'quote', kicker: 'OSMU', text: '소재 하나를 캐러셀·블로그·쇼츠·스레드로 변주하면 제작량이 1/5로 줄어든다.', by: '원소스 멀티유즈의 힘' },
      { type: 'compare', kicker: 'Divide', title: '자동화에 넘길 것 vs 직접 할 것', left: { label: '시스템에 위임', items: ['초안 작성', '이미지 제작', '예약 발행', '성과 정리'] }, right: { label: '사람이 유지', items: ['방향 판단', '브랜드 톤 결정', '최종 검수'] } },
    ],
  },
];

const figPath = join(ROOT, 'data/clients/pslab/blog-figures.json');
const figs = JSON.parse(readFileSync(figPath, 'utf8'));
const haveFig = new Set(figs.map((f) => f.id));
let addedFig = 0;
for (const f of FIGS) {
  if (haveFig.has(f.id)) { console.log(`- 도표 이미 존재: ${f.id} (건너뜀)`); continue; }
  figs.push(f); addedFig++;
}
writeFileSync(figPath, JSON.stringify(figs, null, 2) + '\n');
console.log(`✓ blog-figures.json — 신규 ${addedFig}건 추가`);
console.log('\n완료. 다음: render-cards / render-blog-images / render-shorts → dashboard');
