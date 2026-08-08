#!/usr/bin/env node
/**
 * 키워드 실측 결과 → 리서치 탭 병합 (업체 중립)
 *
 * keyword-volumes.json(광고주센터 키워드 도구 실측)과 keyword-trends.json(핵심·연관·시의성
 * 3시트)을 읽어 research-brief.json 에 '📡 핵심 키워드 실측' 섹션(id: kw-live)으로 업서트한다.
 * 대시보드 리서치 탭이 이 파일을 그대로 그리므로, 이 스크립트가 실측→화면의 연결 고리다.
 *
 * 사용:  node scripts/merge-keyword-research.mjs --client <id>
 * 입력:  data/clients/<id>/keyword-volumes.json (필수) · keyword-trends.json (있으면 시의성 반영)
 * 출력:  data/clients/<id>/research-brief.json 의 kw-live 섹션 교체(없으면 추가)
 *
 * 원칙: 실측만 반영한다 — 파일이 없거나 비어 있으면 아무것도 바꾸지 않고 종료(추정치 금지).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', '');
if (!clientId) { console.error('사용법: node scripts/merge-keyword-research.mjs --client <id>'); process.exit(1); }

const dir = join('data', 'clients', clientId);
const volPath = join(dir, 'keyword-volumes.json');
const trendPath = join(dir, 'keyword-trends.json');
const briefPath = join(dir, 'research-brief.json');

if (!existsSync(volPath)) { console.log('keyword-volumes.json 없음 — 병합 건너뜀'); process.exit(0); }
const vol = JSON.parse(readFileSync(volPath, 'utf8'));
if (!Array.isArray(vol.requested) || !vol.requested.length) { console.log('실측값 없음 — 병합 건너뜀'); process.exit(0); }

const trend = existsSync(trendPath) ? JSON.parse(readFileSync(trendPath, 'utf8')) : null;

// 연관 발굴은 업체 연관 필터(clients/<id>.json keywordPlan.relatedFilter)로 걸러 노이즈 제거
// (keywordstool 연관은 '제습기' 같은 무관 대형 키워드를 함께 반환한다 — 2026-08-08 dbrick 실측 확인)
let relFilter = null;
try {
  const cfg = JSON.parse(readFileSync(join('clients', `${clientId}.json`), 'utf8'));
  if (cfg.keywordPlan && cfg.keywordPlan.relatedFilter) relFilter = new RegExp(cfg.keywordPlan.relatedFilter);
} catch { /* 설정 없으면 필터 없이 진행 */ }
if (relFilter && Array.isArray(vol.related)) vol.related = vol.related.filter((k) => relFilter.test(String(k.keyword || '')));
const brief = existsSync(briefPath)
  ? JSON.parse(readFileSync(briefPath, 'utf8'))
  : { updatedAt: '', title: '브랜드 리서치', sections: [] };

const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const comp = (c) => (c === '높음' || c === 'HIGH' ? '높음' : c === '중간' || c === 'MID' ? '중간' : c === '낮음' || c === 'LOW' ? '낮음' : (c || '-'));
const top = [...vol.requested].sort((a, b) => b.total - a.total);

const section = {
  id: 'kw-live',
  icon: '📡',
  title: '핵심 키워드 실측 — 광고주센터 키워드 도구',
  desc: `네이버 검색광고 API(keywordstool) 실측 월간검색수 — 광고주센터 '키워드 도구' 화면과 동일한 데이터입니다(수집 ${String(vol.updatedAt || '').slice(0, 10)}, 매월 1일 자동 갱신). 'PC/모바일'은 최근 30일 조회수, '< 10' 소량 구간은 5로 표기됩니다. 월별 흐름 변화는 위 '검색 수요·계절성'(데이터랩 상대지수 — 추세용)과 함께 읽어주세요: 이 표가 '지금 얼마나 찾는가', 데이터랩이 '언제 늘고 주는가'를 담당합니다.`,
  stats: [
    { v: fmt(top.reduce((s, k) => s + k.total, 0)), l: '핵심 키워드 월간검색 합계' },
    { v: fmt(top[0].total) + ' · ' + top[0].keyword, l: '최대 검색 키워드' },
    { v: String(vol.requested.length) + '개', l: '실측 핵심 키워드' },
    { v: String((vol.related || []).length) + '개', l: '연관 발굴 키워드' },
  ],
  bars: {
    title: '핵심 키워드 월간검색수 TOP 10 (PC+모바일)',
    unit: '',
    items: top.slice(0, 10).map((k) => ({ label: k.keyword, value: k.total, note: '경쟁 ' + comp(k.compIdx) })),
  },
  table: {
    head: ['키워드', '월간검색 합계', 'PC', '모바일', '경쟁정도'],
    rows: top.slice(0, 20).map((k) => [k.keyword, fmt(k.total), fmt(k.pc), fmt(k.mobile), comp(k.compIdx)]),
  },
  list: [],
};

// 연관 발굴 상위 — 시드에 없던 키워드 중 검색량 상위 (콘텐츠 소재 후보)
const rel = (vol.related || []).slice(0, 8);
if (rel.length) {
  section.list.push({
    t: '연관 발굴 TOP ' + rel.length,
    d: rel.map((k) => `${k.keyword}(${fmt(k.total)})`).join(' · ') + ' — 시드 밖에서 발굴된 소재 후보',
  });
}
// 시의성 시트(keyword-trends.json) — 시즌 흐름 반영
if (trend && Array.isArray(trend.timely) && trend.timely.length) {
  section.list.push({
    t: `시의성 키워드 (기준일 ${trend.baseDate || '-'})`,
    d: trend.timely.slice(0, 8).map((k) => `${k.kw}(${fmt(k.total)})`).join(' · '),
  });
}

const i = (brief.sections || []).findIndex((s) => s && s.id === 'kw-live');
if (i >= 0) brief.sections[i] = section; else brief.sections.push(section);
brief.updatedAt = new Date().toISOString();
writeFileSync(briefPath, JSON.stringify(brief, null, 2), 'utf8');
console.log(`리서치 탭 병합 완료: ${briefPath} — kw-live 섹션 ${i >= 0 ? '갱신' : '추가'} (핵심 ${vol.requested.length} · 연관 ${(vol.related || []).length})`);
