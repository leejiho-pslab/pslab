#!/usr/bin/env node
/**
 * 블로그 본문 + 삽입 이미지 시드 (네이버·구글 블로그)
 *
 * 같은 주제라도 네이버와 구글 블로그는 "글 내용 + 삽입 이미지"가 모두 달라야
 * SEO 품질지수가 떨어지지 않는다. 이 스크립트는:
 *  - 네이버 4편 / 블로거 4편을 서로 다른 글로 작성(같은 주제군, 다른 사례·구성)
 *  - 각 글에 본문과 맞는 도표 4개를 정의(blog-figures.json) + 본문에 이미지 삽입
 *  - plan.json의 해당 항목 captionBody/슬라이드를 갱신
 *
 * 이미지 실제 렌더는 scripts/render-blog-images.mjs 가 수행한다.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PAGES = process.env.PSLAB_PAGES_BASE ?? 'https://leejiho-pslab.github.io/pslab';
const FILE = 'data/clients/pslab/plan.json';
const FIG_FILE = 'data/clients/pslab/blog-figures.json';

// ── 8편: 같은 주제군, 네이버/블로거 서로 다른 글 ───────────────────────────
const POSTS = [
  // 1. 대행사 — 네이버: 맡기기 전 점검
  {
    id: 'naver-blog-07-02', channel: 'naver-blog', scheduledFor: '2026-07-02T11:00:00.000Z',
    kicker: 'Agency', title: '광고대행사에 맡기기 전, 반드시 확인할 5가지',
    summary: '대행사를 잘못 만나면 돈만 태웁니다. 계약 전 "이 다섯 가지"를 물어보면 80%는 거를 수 있습니다.',
    tags: ['광고대행사', '마케팅대행', '대행사선택', '광고비'],
    intro: '15년간 대행 일을 하며, 또 반대로 대행사를 써보며 깨달은 건 분명합니다. 실력 차이는 제안서가 아니라 "질문에 답하는 방식"에서 드러납니다.',
    sections: [
      { h: '1. 누가 실제로 내 계정을 만지는가', body: '제안 미팅엔 베테랑이 오고, 운영은 신입이 하는 구조가 흔합니다. "담당자 경력과 동시 운영 계정 수"를 반드시 물어보세요. 한 명이 20개를 돌리면 내 계정은 방치됩니다.',
        fig: { type: 'stat', kicker: 'Reality', title: '한 명이 동시에 돌리는 계정 수', value: '15+', label: '개 — 그만큼 내 계정은 덜 봅니다', sub: '계약 전 "내 담당자가 맡은 계정 수"를 꼭 확인하세요.' } },
      { h: '2. 성과 보고가 "지표"인가 "매출"인가', body: '노출·클릭·CTR만 잔뜩 적힌 보고서는 위험 신호입니다. 클릭은 늘어도 매출은 그대로일 수 있으니까요. 전환·매출·ROAS로 말하는 곳을 고르세요.',
        fig: { type: 'compare', kicker: 'Report', title: '좋은 보고 vs 나쁜 보고', left: { label: '피해야 할 보고', items: ['노출 120만', 'CTR 2.3%', '클릭 2.7만'] }, right: { label: '좋은 보고', items: ['전환 320건', '매출 4,800만원', 'ROAS 410%'] } } },
      { h: '3. 광고비와 수수료가 분리돼 있는가', body: '광고비에 수수료가 녹아 있으면 대행사는 "더 쓰게" 만들 동기가 생깁니다. 광고비와 운영 수수료를 항목으로 분리한 견적을 요구하세요.',
        fig: { type: 'checklist', kicker: 'Contract', title: '계약서에서 분리 확인할 항목', items: ['매체 광고비(실비)', '운영 수수료(%)', '제작비(별도)', '리포트 주기와 형식'] } },
      { h: '4. 초기 2주에 무엇을 하기로 했는가', body: '잘하는 곳은 첫 2주를 "학습 기간"으로 설계합니다. 소액으로 여러 소재를 테스트해 데이터를 모으죠. 처음부터 풀예산을 태우자는 곳은 거르세요.',
        fig: { type: 'steps', kicker: 'Onboarding', title: '좋은 대행사의 첫 2주', steps: [ { label: '소재 3~5종 소액 테스트', desc: '승자 소재를 데이터로 찾기' }, { label: '전환 추적 세팅', desc: '픽셀·이벤트·UTM 점검' }, { label: '주간 리뷰 후 예산 집중', desc: '검증된 소재에 비중 이동' } ] } },
    ],
    faq: [ ['수수료는 보통 몇 %인가요?', '매체비의 10~20%가 일반적입니다. 다만 "관리 범위(제작 포함 여부)"에 따라 다르니 항목으로 확인하세요.'], ['소규모도 대행을 맡기는 게 나을까요?', '월 광고비 300만원 미만이면 직접 + 부분 자문이 효율적일 때가 많습니다.'] ],
    cta: '대행사 미팅 전에 이 다섯 질문을 그대로 던져보세요. 답하는 태도만 봐도 절반은 결정됩니다.',
  },
  // 1'. 대행사 — 블로거: 함께 일하며 후회/잘한 것 (다른 글)
  {
    id: 'blogger-07-02', channel: 'blogger', scheduledFor: '2026-07-03T09:00:00.000Z',
    kicker: 'Agency', title: '대행사와 3년 일하며 후회한 것, 잘한 것',
    summary: '결론부터: 대행사는 "맡기는 것"이 아니라 "같이 운영하는 것"입니다. 통째로 맡기면 반드시 후회합니다.',
    tags: ['광고대행사', '마케팅', '협업', '성과관리'],
    intro: '제안서 비교만 하던 시절엔 늘 실패했습니다. 방식을 바꾸고 나서야 대행이 일하기 시작했죠. 직접 겪은 후회 둘, 잘한 셋을 풉니다.',
    sections: [
      { h: '후회 1 — "알아서 해주세요"라고 맡긴 것', body: '브랜드를 가장 잘 아는 건 결국 우리입니다. 방향을 안 주면 대행사는 무난한 평균값으로 갑니다. 결과는 "나쁘진 않은데 아무것도 아닌" 광고였습니다.',
        fig: { type: 'quote', kicker: 'Lesson', text: '맡기지 말고, 같이 운영하라.', by: '광고비 2천만원으로 배운 것' } },
      { h: '후회 2 — 매주 숫자를 안 본 것', body: '한 달에 한 번 보고만 받으니, 안 되는 소재에 3주를 버렸습니다. 대시보드를 같이 보기 시작한 뒤로 낭비가 절반으로 줄었습니다.',
        fig: { type: 'stat', kicker: 'Waste', title: '월 1회 보고 → 주 1회 점검', value: '-48%', label: '불필요한 광고비 감소', sub: '안 되는 소재를 빨리 끄는 것만으로.' } },
      { h: '잘한 1 — 소재 아이디어를 우리가 던진 것', body: '현장의 고객 질문, 후기, 반품 사유 — 이게 최고의 광고 소재입니다. 대행사는 이걸 모릅니다. 우리가 소재를 던지고 대행사가 다듬자 반응이 올랐습니다.',
        fig: { type: 'checklist', kicker: 'Source', title: '가장 잘 먹힌 소재의 출처', items: ['고객이 자주 묻는 질문', '실제 후기 문장', '반품·환불 사유', '상담에서 반복되는 고민'] } },
      { h: '잘한 2 — 역할을 문서로 나눈 것', body: '"누가 무엇을, 언제까지"를 한 장으로 정리했습니다. 책임이 분명해지자 핑퐁이 사라졌죠.',
        fig: { type: 'compare', kicker: 'Roles', title: '역할 분담', left: { label: '우리(브랜드)', items: ['소재 방향·메시지', '제품/혜택 정보', '최종 의사결정'] }, right: { label: '대행사', items: ['세팅·입찰·최적화', '소재 제작·실험', '주간 리포트'] } } },
    ],
    faq: [ ['대행사를 바꿔야 할 신호는?', '3개월 연속 같은 변명, 매출 언어 부재, 담당자 잦은 교체 — 셋 중 둘이면 교체를 검토하세요.'], ['소액인데 같이 운영이 가능한가요?', '오히려 소액일수록 우리가 소재를 주도해야 효율이 납니다.'] ],
    cta: '대행을 통째로 맡기지 마세요. 방향은 우리가, 실행은 대행사가 — 이 경계가 성과를 만듭니다.',
  },
  // 2. 클릭 vs 매출 — 네이버: 진단
  {
    id: 'naver-blog-07-09', channel: 'naver-blog', scheduledFor: '2026-07-09T11:00:00.000Z',
    kicker: 'Conversion', title: '클릭은 느는데 매출이 안 오르는 진짜 이유',
    summary: '광고를 늘렸는데 매출이 그대로라면, 문제는 광고가 아니라 "클릭 다음"에 있습니다.',
    tags: ['전환율', '랜딩페이지', '광고효율', 'CRO'],
    intro: '"광고비를 늘렸는데 왜 매출이 안 늘죠?" 가장 많이 받는 질문입니다. 답은 거의 항상 광고 바깥, 도착 페이지에 있습니다.',
    sections: [
      { h: '클릭과 매출 사이엔 깔때기가 있다', body: '클릭 → 페이지 체류 → 장바구니 → 결제. 이 깔때기에서 어디가 새는지 모르면 광고비만 늘립니다. 먼저 단계별 이탈률부터 보세요.',
        fig: { type: 'bars', kicker: 'Funnel', title: '전형적인 이탈 구간', bars: [ { label: '클릭→체류', pct: 100, val: '100' }, { label: '체류→장바구니', pct: 22, val: '22%' }, { label: '장바구니→결제', pct: 9, val: '9%' } ] } },
      { h: '첫 3초가 매출을 결정한다', body: '도착 페이지 상단에서 "여기가 내가 찾던 곳"이라는 확신을 3초 안에 못 주면 떠납니다. 광고 문구와 페이지 첫 화면의 메시지를 똑같이 맞추세요.',
        fig: { type: 'checklist', kicker: 'Above the fold', title: '첫 화면에 반드시 있을 것', items: ['광고와 같은 핵심 메시지', '구체적 혜택(숫자)', '신뢰 요소(후기·보장)', '눈에 띄는 행동 버튼'] } },
      { h: '후기가 없으면 결제까지 안 간다', body: '특히 처음 보는 브랜드는 후기 수가 곧 전환율입니다. 후기 10개 미만이라면 광고 확장보다 후기 확보가 먼저입니다.',
        fig: { type: 'stat', kicker: 'Trust', title: '후기 유무에 따른 전환율 차이', value: '2.4x', label: '후기 있는 페이지의 전환율', sub: '광고를 늘리기 전에 후기부터 채우세요.' } },
      { h: '결제 단계의 마찰을 없애라', body: '회원가입 강제, 과한 입력칸, 느린 로딩 — 결제 직전 이탈의 주범입니다. 비회원 결제와 간편결제를 열어두세요.',
        fig: { type: 'steps', kicker: 'Checkout', title: '결제 이탈 줄이는 3수', steps: [ { label: '비회원 결제 허용', desc: '가입 강제 제거' }, { label: '입력칸 최소화', desc: '필수만 남기기' }, { label: '간편결제 추가', desc: '카카오·네이버페이' } ] } },
    ],
    faq: [ ['광고를 멈춰야 하나요?', '아니요. 광고는 유지하되 예산 증액을 멈추고, 페이지 전환율부터 올리세요.'], ['전환율 몇 %가 정상인가요?', '업종마다 다르지만 이커머스 1~3%가 일반적입니다. 1% 미만이면 페이지부터 점검하세요.'] ],
    cta: '광고비를 더 쓰기 전에, 클릭 다음의 깔때기부터 막으세요. 같은 광고비로 매출이 달라집니다.',
  },
  // 2'. 클릭 vs 매출 — 블로거: 실전 점검표 (다른 글)
  {
    id: 'blogger-07-09', channel: 'blogger', scheduledFor: '2026-07-10T09:00:00.000Z',
    kicker: 'Landing', title: '전환율을 두 배로 올린 랜딩페이지 점검표',
    summary: '광고를 안 바꾸고 페이지만 고쳐 전환율을 2배로 올린 적이 있습니다. 그때 쓴 점검표를 공개합니다.',
    tags: ['랜딩페이지', '전환율', 'CRO', '상세페이지'],
    intro: '소재를 아무리 바꿔도 매출이 안 늘던 브랜드가 있었습니다. 광고는 그대로 두고 페이지만 9곳 고쳤더니 전환율이 두 배가 됐죠.',
    sections: [
      { h: '히어로 영역: 한 문장으로 끝내라', body: '맨 위 한 문장이 "무엇을, 누구에게, 왜 좋은지"를 못 담으면 아래는 안 읽힙니다. 형용사 말고 숫자와 결과로 쓰세요.',
        fig: { type: 'compare', kicker: 'Hero', title: '바꾸기 전 vs 후', left: { label: 'Before', items: ['프리미엄 스킨케어', '당신을 위한 선택', '지금 만나보세요'] }, right: { label: 'After', items: ['건조함 14일 케어', '재구매율 67%', '오늘 주문 → 내일 도착'] } } },
      { h: '증거를 위로 올려라', body: '후기·인증·수상·판매수를 페이지 하단에 묻어두지 마세요. 첫 화면 바로 아래로 올리면 신뢰가 빨라집니다.',
        fig: { type: 'checklist', kicker: 'Proof', title: '위로 올릴 신뢰 요소', items: ['누적 판매 수량', '별점과 후기 수', '재구매율', '인증·수상·언론'] } },
      { h: 'CTA는 한 가지만', body: '"구매·상담·뉴스레터" 세 개를 동시에 권하면 아무것도 안 누릅니다. 페이지마다 행동 하나로 좁히세요.',
        fig: { type: 'stat', kicker: 'Focus', title: 'CTA를 하나로 줄였을 때', value: '+38%', label: '클릭률 상승', sub: '선택지를 줄이면 행동이 늘어납니다.' } },
      { h: '모바일에서 다시 보라', body: '트래픽의 80%는 모바일입니다. 데스크톱에서 멀쩡해도 모바일에서 버튼이 접히거나 글자가 작으면 거기서 매출이 샙니다.',
        fig: { type: 'bars', kicker: 'Device', title: '유입 vs 매출 비중', bars: [ { label: '모바일 유입', pct: 80, val: '80%' }, { label: '모바일 매출', pct: 61, val: '61%' }, { label: '격차(개선 여지)', pct: 19, val: '19%p' } ] } },
    ],
    faq: [ ['몇 개를 한 번에 바꿔야 하나요?', '한 번에 하나씩 바꿔 A/B로 검증하는 게 정석이지만, 트래픽이 적으면 묶어서 크게 바꾸고 추세를 보세요.'], ['전환율은 어디서 보나요?', 'GA4·네이버 애널리틱스의 구매전환 이벤트로 단계별 이탈을 봅니다.'] ],
    cta: '광고를 더 만지기 전에 이 점검표로 페이지부터 고치세요. 가장 싸게 매출을 올리는 방법입니다.',
  },
  // 3. 작은 브랜드 '왜' — 네이버
  {
    id: 'naver-blog-07-16', channel: 'naver-blog', scheduledFor: '2026-07-16T11:00:00.000Z',
    kicker: 'Brand', title: '작은 브랜드일수록 \'무엇\'이 아니라 \'왜\'를 팔아야 합니다',
    summary: '기능으로 싸우면 대기업을 못 이깁니다. 작은 브랜드의 무기는 "왜 이걸 만들었는가"라는 이유입니다.',
    tags: ['브랜딩', '스몰브랜드', '포지셔닝', '브랜드스토리'],
    intro: '스펙 비교표를 만들수록 작은 브랜드는 불리해집니다. 가격도 물량도 밀리니까요. 그런데 "왜"로 옮기는 순간 판이 바뀝니다.',
    sections: [
      { h: '기능은 복제되지만 이유는 복제 안 된다', body: '같은 성분, 같은 사양은 곧 따라옵니다. 하지만 "왜 시작했는지"는 베낄 수 없습니다. 그게 작은 브랜드의 유일한 해자입니다.',
        fig: { type: 'quote', kicker: 'Why', text: '무엇을 파는지가 아니라, 왜 만드는지를 팔아라.', by: '작은 브랜드의 생존 공식' } },
      { h: '\'왜\'는 한 사람의 이야기에서 나온다', body: '거창한 미션이 아니라, 창업자가 겪은 구체적 불편 하나면 충분합니다. 그 장면을 보여주면 고객은 자기 이야기로 받아들입니다.',
        fig: { type: 'checklist', kicker: 'Story', title: '\'왜\'를 만드는 재료', items: ['내가 겪은 불편한 장면', '기존 제품에 화났던 순간', '"이건 아니다" 싶었던 경험', '바꾸고 싶었던 한 가지'] } },
      { h: '이유가 같은 사람만 모아라', body: '모두를 설득하려 하면 아무에게도 안 남습니다. "이 이유에 공감하는 사람"만 정확히 겨냥하세요. 작을수록 좁혀야 합니다.',
        fig: { type: 'compare', kicker: 'Target', title: '넓게 vs 좁게', left: { label: '대기업식(넓게)', items: ['모두에게', '최대 도달', '평균적 메시지'] }, right: { label: '스몰브랜드식(좁게)', items: ['이 이유에 공감하는 사람', '깊은 충성', '뾰족한 메시지'] } } },
      { h: '\'왜\'를 모든 접점에 반복하라', body: '상세페이지, 패키지, SNS, 응대까지 같은 이유가 흐르면 브랜드가 됩니다. 채널마다 말투는 달라도 이유는 하나여야 합니다.',
        fig: { type: 'steps', kicker: 'Consistency', title: '이유를 새기는 접점', steps: [ { label: '상세페이지 첫 문단', desc: '왜 만들었는지부터' }, { label: '패키지·카드', desc: '한 줄의 이유' }, { label: 'SNS·응대', desc: '같은 톤으로 반복' } ] } },
    ],
    faq: [ ['스토리가 특별하지 않은데요?', '특별할 필요 없습니다. 구체적이면 됩니다. "왜"는 크기가 아니라 진정성으로 작동합니다.'], ['기능 설명은 빼야 하나요?', '아니요. 이유로 끌고 기능으로 확신을 주세요. 순서가 핵심입니다.'] ],
    cta: '오늘 상세페이지 첫 문단을 "왜"로 바꿔보세요. 같은 제품이 다르게 보이기 시작합니다.',
  },
  // 3'. 작은 브랜드 — 블로거: 다르게 싸우는 법 (다른 글)
  {
    id: 'blogger-07-16', channel: 'blogger', scheduledFor: '2026-07-17T09:00:00.000Z',
    kicker: 'Strategy', title: '작은 브랜드가 대기업과 \'다르게\' 싸우는 4가지 방법',
    summary: '대기업과 같은 방식으로 싸우면 집니다. 작을 때만 쓸 수 있는 무기 네 가지로 판을 바꾸세요.',
    tags: ['스몰브랜드', '마케팅전략', '포지셔닝', '차별화'],
    intro: '예산도 인력도 밀리는데 같은 운동장에서 싸우면 당연히 집니다. 작을 때만 가능한 방식이 따로 있습니다.',
    sections: [
      { h: '1. 속도로 싸운다', body: '대기업은 의사결정이 느립니다. 우리는 오늘 본 트렌드를 내일 콘텐츠로 만들 수 있죠. 시의성은 작은 브랜드의 가장 큰 무기입니다.',
        fig: { type: 'stat', kicker: 'Speed', title: '트렌드 반응 속도', value: '1일', label: '우리 vs 대기업 수 주', sub: '오늘 본 이슈를 내일 콘텐츠로.' } },
      { h: '2. 좁은 시장 1등을 노린다', body: '전체 시장 10등보다, 좁은 카테고리 1등이 훨씬 강합니다. "○○ 하면 이 브랜드"가 되는 한 칸을 먼저 차지하세요.',
        fig: { type: 'compare', kicker: 'Position', title: '어디서 1등 할 것인가', left: { label: '큰 시장 10등', items: ['인지도 분산', '가격 경쟁', '존재감 약함'] }, right: { label: '좁은 시장 1등', items: ['카테고리 대표', '추천·재구매', '검색 장악'] } } },
      { h: '3. 얼굴을 보여준다', body: '대기업은 브랜드 뒤에 숨지만, 작은 브랜드는 사람이 앞에 설 수 있습니다. 창업자·직원의 얼굴과 과정이 곧 차별화입니다.',
        fig: { type: 'checklist', kicker: 'Human', title: '사람을 드러내는 콘텐츠', items: ['만드는 과정 비하인드', '창업자의 결정과 고민', '고객과의 실제 대화', '실패와 개선 기록'] } },
      { h: '4. 팬을 만든다', body: '100만 명에게 한 번 보이는 것보다, 1,000명이 매번 사주고 소문내는 게 강합니다. 작은 브랜드는 도달이 아니라 관계로 큽니다.',
        fig: { type: 'bars', kicker: 'Fans', title: '도달 vs 관계', bars: [ { label: '도달형(1회 노출)', pct: 30, val: '얕음' }, { label: '관계형(재구매)', pct: 85, val: '깊음' }, { label: '추천 전파', pct: 70, val: '강함' } ] } },
    ],
    faq: [ ['좁히면 시장이 너무 작지 않나요?', '처음엔 좁게 1등 → 인접 카테고리로 확장이 정석입니다. 넓게 시작해 망하는 경우가 더 많습니다.'], ['얼굴 노출이 부담스러워요.', '꼭 대표가 아니어도 됩니다. 과정·손·작업 현장만 보여도 사람 냄새가 납니다.'] ],
    cta: '대기업의 방식을 따라 하지 마세요. 속도·집중·사람·관계 — 작을 때만 쓸 수 있는 무기로 싸우세요.',
  },
  // 4. 예산 배분 — 네이버: 70-20-10
  {
    id: 'naver-blog-07-23', channel: 'naver-blog', scheduledFor: '2026-07-23T11:00:00.000Z',
    kicker: 'Budget', title: '광고 예산, 어디에 써야 하나 — 70-20-10 법칙',
    summary: '예산을 골고루 나누면 골고루 실패합니다. 검증된 곳에 70%, 확장에 20%, 실험에 10%로 가세요.',
    tags: ['광고예산', '예산배분', 'ROAS', '퍼포먼스마케팅'],
    intro: '예산 배분에서 가장 흔한 실수는 "공평하게 나누기"입니다. 마케팅은 공평이 아니라 집중이 이깁니다.',
    sections: [
      { h: '70% — 검증된 곳에 몰아준다', body: '이미 ROAS가 나오는 채널·소재에 예산의 70%를 둡니다. 잘 되는 걸 더 키우는 게 가장 확실한 성장입니다.',
        fig: { type: 'bars', kicker: '70-20-10', title: '예산 배분 비율', bars: [ { label: '70% 검증된 곳', pct: 70, val: '70%' }, { label: '20% 확장', pct: 20, val: '20%' }, { label: '10% 실험', pct: 10, val: '10%' } ] } },
      { h: '20% — 될 것 같은 곳을 확장한다', body: '신호는 있지만 아직 검증 전인 채널·타겟에 20%. 여기서 다음 70%가 나옵니다. 확장 없이 70%만 지키면 정체합니다.',
        fig: { type: 'stat', kicker: 'Scale', title: '확장 예산의 역할', value: '20%', label: '내일의 주력을 키우는 자리', sub: '오늘의 70%도 한때는 이 20%였습니다.' } },
      { h: '10% — 깨질 각오로 실험한다', body: '새 채널, 엉뚱한 소재, 낯선 타겟. 10%는 잃어도 되는 돈입니다. 이 실험이 없으면 브랜드는 한 우물에 갇힙니다.',
        fig: { type: 'checklist', kicker: 'Test', title: '10% 실험 아이디어', items: ['안 써본 새 채널', '평소와 다른 소재 톤', '낯선 타겟군', '새 콘텐츠 포맷'] } },
      { h: '한 달에 한 번 비율을 다시 짠다', body: '70-20-10은 고정이 아닙니다. 실험에서 신호가 나오면 확장으로, 확장이 검증되면 주력으로 — 매달 자리를 갈아끼우세요.',
        fig: { type: 'steps', kicker: 'Rebalance', title: '매월 재배분 루틴', steps: [ { label: '성과 정렬', desc: 'ROAS 순으로 줄 세우기' }, { label: '승자 승급', desc: '실험→확장→주력 이동' }, { label: '패자 정리', desc: '신호 없는 곳 중단' } ] } },
    ],
    faq: [ ['예산이 적어도 이 비율을 지키나요?', '월 100만원이라도 70/20/10은 유효합니다. 다만 10%(10만원)는 한 가지 실험에 몰아주세요.'], ['70%를 어떻게 정하나요?', '최근 4주 ROAS가 가장 높은 채널·소재 조합이 기준입니다.'] ],
    cta: '오늘 예산을 70-20-10으로 다시 나눠보세요. 공평을 버리고 집중을 택하는 순간 효율이 달라집니다.',
  },
  // 4'. 예산 — 블로거: 월 100만원 소액 실전 (다른 글)
  {
    id: 'blogger-07-23', channel: 'blogger', scheduledFor: '2026-07-24T09:00:00.000Z',
    kicker: 'Budget', title: '월 100만원으로 시작하는 광고, 이렇게 나눴습니다',
    summary: '예산이 적을수록 분산은 독입니다. 월 100만원을 실제로 어떻게 쪼갰는지, 숫자 그대로 공개합니다.',
    tags: ['소액광고', '광고예산', '스타트업마케팅', '예산배분'],
    intro: '"예산이 적은데 어디에 써야 하나요?"—가장 많이 받는 질문입니다. 월 100만원 기준, 제가 실제로 굴리는 방식입니다.',
    sections: [
      { h: '먼저 70만원: 한 채널만 판다', body: '소액일수록 채널을 늘리면 안 됩니다. 우리 고객이 가장 많은 한 곳에 70만원을 몰아 데이터를 빨리 모으세요.',
        fig: { type: 'stat', kicker: 'Focus', title: '소액일수록', value: '1', label: '개 채널에 집중', sub: '두세 곳에 나누면 데이터가 안 쌓입니다.' } },
      { h: '20만원: 소재 실험에만 쓴다', body: '같은 채널 안에서 소재 3~4종을 20만원으로 돌립니다. 승자 소재를 찾으면 70만원이 더 잘 돕니다.',
        fig: { type: 'steps', kicker: 'Creative', title: '20만원 소재 실험', steps: [ { label: '소재 3~4종 준비', desc: '후킹·앵글 다르게' }, { label: '소액 균등 분배', desc: '5만원씩 동시 송출' }, { label: '승자만 살리기', desc: '나머지 중단' } ] } },
      { h: '10만원: 콘텐츠/후기 자산에 쓴다', body: '광고만으론 한계가 있습니다. 10만원은 후기 확보, 콘텐츠 제작 같은 "쌓이는 자산"에 투자하세요. 광고가 꺼져도 남습니다.',
        fig: { type: 'checklist', kicker: 'Asset', title: '쌓이는 곳에 쓰기', items: ['후기 이벤트', '블로그·SNS 콘텐츠', '상세페이지 개선', '재구매 메시지'] } },
      { h: '석 달 뒤 숫자로 다시 정한다', body: '100만원을 3개월 돌리면 어디가 효율적인지 보입니다. 그때 비율을 키우거나 채널을 바꾸세요. 처음 배분은 가설일 뿐입니다.',
        fig: { type: 'bars', kicker: 'Plan', title: '월 100만원 배분', bars: [ { label: '주력 채널', pct: 70, val: '70만' }, { label: '소재 실험', pct: 20, val: '20만' }, { label: '자산 투자', pct: 10, val: '10만' } ] } },
    ],
    faq: [ ['100만원도 안 되면요?', '50만원이면 채널 하나 + 소재 실험만 하세요. 자산 투자는 매출이 나면 시작해도 늦지 않습니다.'], ['어느 채널부터 시작할까요?', '고객이 검색으로 오면 검색광고, 발견으로 오면 인스타·메타부터 테스트하세요.'] ],
    cta: '적은 예산일수록 "나누지 말고 몰아주세요." 한 채널에서 이기는 공식을 먼저 찾는 게 순서입니다.',
  },
];

// ── 본문(markdown) + 도표 스펙 생성 ────────────────────────────────────────
function buildBody(post) {
  const lines = [];
  lines.push(`# ${post.title}`);
  lines.push(`> [핵심 요약] ${post.summary}`);
  lines.push('');
  if (post.intro) { lines.push(post.intro); lines.push(''); }
  post.sections.forEach((s, i) => {
    lines.push(`## ${s.h}`);
    lines.push(s.body);
    lines.push(`![${s.h}](${PAGES}/blog/${post.id}/fig-${i + 1}.png)`);
    lines.push('');
  });
  if (post.faq?.length) {
    lines.push('## 자주 묻는 질문');
    for (const [q, a] of post.faq) { lines.push(`**Q. ${q}**`); lines.push(a); lines.push(''); }
  }
  if (post.cta) { lines.push(post.cta); lines.push(''); }
  lines.push(`🔖 태그: ${post.tags.map((t) => '#' + t).join(' ')}`);
  return lines.join('\n');
}

const plan = JSON.parse(readFileSync(FILE, 'utf8'));
const byId = new Map(plan.items.map((it) => [it.id, it]));
const figures = [];

for (const post of POSTS) {
  const body = buildBody(post);
  const cover = `${PAGES}/blog/${post.id}/fig-1.png`;
  const slideImgs = post.sections.map((_, i) => `blog/${post.id}/fig-${i + 1}.png`);
  const base = {
    id: post.id,
    topic: post.title,
    format: post.channel === 'blogger' ? 'blogger' : 'naver-blog',
    channels: [post.channel],
    scheduledFor: post.scheduledFor,
    score: 82,
    status: 'planned',
    kicker: post.kicker,
    headline: post.title,
    sub: post.summary,
    dayLabel: post.channel === 'blogger' ? '구글 블로그' : '네이버 블로그',
    captionBody: body,
    captionNote: post.summary,
    cardImage: slideImgs[0],
    slideImages: slideImgs,
    tags: post.tags,
  };
  const existing = byId.get(post.id);
  if (existing) Object.assign(existing, base);
  else { plan.items.push(base); byId.set(post.id, base); }

  figures.push({ id: post.id, channel: post.channel, figures: post.sections.map((s) => s.fig) });
}

plan.updatedAt = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(plan, null, 2), 'utf8');
writeFileSync(FIG_FILE, JSON.stringify(figures, null, 2), 'utf8');
console.log(`블로그 글 ${POSTS.length}편 + 도표 ${figures.reduce((a, f) => a + f.figures.length, 0)}개 시드 완료`);
console.log(`  → plan.json 갱신, ${FIG_FILE} 작성`);
