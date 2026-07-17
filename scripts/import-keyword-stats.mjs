#!/usr/bin/env node
/**
 * 네이버 광고주센터 키워드 도구 '전체 다운로드' CSV → keyword-stats.json 변환기
 *
 * 사용법:
 *   node scripts/import-keyword-stats.mjs --client daeguis --csv <다운로드한.csv> [--date 2026-07-17]
 *
 * - 키워드 도구(광고주센터 > 도구 > 키워드 도구)에서 조회 후 '전체 다운로드'로 받은 CSV를 그대로 넣는다.
 * - '< 10' 표기는 null(비공개 소량)로 저장한다. 어떤 경우에도 추정치·난수를 만들지 않는다.
 * - 결과: data/clients/<id>/keyword-stats.json → 대시보드 '키워드 월간 검색수' 표가 실측값으로 바뀐다.
 * - 인코딩: UTF-8/EUC-KR 자동 감지.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const clientId = args.client;
const csvPath = args.csv;
if (!clientId || !csvPath) {
  console.error('사용법: node scripts/import-keyword-stats.mjs --client <id> --csv <파일.csv> [--date YYYY-MM-DD]');
  process.exit(1);
}

const buf = readFileSync(csvPath);
let text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf); // 엑셀 저장본(EUC-KR) 대응
text = text.replace(/^﻿/, '');

// CSV 파싱 (따옴표·쉼표 안전)
function parseCsv(t) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x !== '')) rows.push(row); }
  return rows;
}
const rows = parseCsv(text);
if (!rows.length) { console.error('CSV가 비어 있습니다.'); process.exit(1); }

// 헤더 매핑 — 키워드 도구 컬럼명(연관키워드/월간검색수(PC)/월간검색수(모바일)/월평균클릭수/경쟁정도/월평균노출 광고수)
const head = rows[0].map((h) => h.replace(/\s/g, ''));
const col = (...cands) => head.findIndex((h) => cands.some((c) => h.includes(c)));
const iKw = col('연관키워드', '키워드');
const iPc = col('월간검색수(PC)', '월간검색수(pc)', '검색수(PC)');
const iMo = col('월간검색수(모바일)', '검색수(모바일)');
const iComp = col('경쟁정도');
const iAd = col('월평균노출광고수', '노출광고수');
const iClkP = col('월평균클릭수(PC)');
const iClkM = col('월평균클릭수(모바일)');
if (iKw < 0 || iPc < 0 || iMo < 0) {
  console.error('키워드 도구 CSV 형식이 아닙니다. 헤더:', rows[0].join(' | '));
  process.exit(1);
}
const num = (v) => {
  const s = String(v ?? '').trim().replace(/,/g, '');
  if (!s || s.startsWith('<')) return null; // '< 10' = 비공개 소량
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const items = rows.slice(1).filter((r) => r[iKw]).map((r) => ({
  kw: String(r[iKw]).trim(),
  pc: num(r[iPc]),
  mobile: num(r[iMo]),
  competition: iComp >= 0 ? String(r[iComp]).trim() || undefined : undefined,
  adCount: iAd >= 0 ? num(r[iAd]) : undefined,
  clicks: iClkP >= 0 || iClkM >= 0 ? (num(r[iClkP]) ?? 0) + (num(r[iClkM]) ?? 0) : undefined,
}));

const out = {
  source: '네이버 광고주센터 키워드 도구',
  fetchedAt: args.date || new Date().toISOString().slice(0, 10),
  items,
};
const dir = join('data', 'clients', clientId);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'keyword-stats.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`✅ 실측 키워드 ${items.length}개 저장 → ${join(dir, 'keyword-stats.json')}`);
console.log('   대시보드 반영: npx tsx src/cli.ts dashboard --clients-dir ./clients-daeguis --out ./docs/daeguis/index.html');
