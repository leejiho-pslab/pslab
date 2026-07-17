#!/usr/bin/env node
/**
 * 일일 발행 일정 재배치 — 미발행 항목을 "하루 한 개, 18:00 KST"로 채널을 번갈아 배치.
 *
 * - 이미 발행(published)된 항목은 건드리지 않는다.
 * - 채널별로 라운드로빈(번갈아) 정렬해 매일 다른 채널이 나오도록 한다.
 * - scheduledFor = 시작일부터 하루씩 증가, 매일 09:00:00Z(= 18:00 KST).
 *
 * 사용: node scripts/schedule-daily.mjs --client pslab [--start 2026-07-01]
 *   --start 미지정 시 "내일"(UTC 기준 다음 날)부터 시작.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'pslab');
const startArg = arg('start', '');
const perDay = Math.max(1, Number(arg('perday', '1'))); // 하루 몇 건 발행할지

const FILE = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = JSON.parse(readFileSync(FILE, 'utf8'));

// 시작일(UTC 자정 기준) — 지정 없으면 내일
let start;
if (startArg) {
  start = new Date(`${startArg}T00:00:00.000Z`);
} else {
  start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);
}
start.setUTCHours(9, 0, 0, 0); // 09:00 UTC = 18:00 KST

const pending = plan.items.filter((it) => it.status !== 'published');

// 채널별 그룹 → 라운드로빈으로 섞어 매일 채널이 번갈아 나오게
const groups = new Map();
for (const it of pending) {
  const ch = it.channels[0];
  if (!groups.has(ch)) groups.set(ch, []);
  groups.get(ch).push(it);
}
// 각 그룹은 기존 순서(날짜순) 유지
const queues = [...groups.values()];
const ordered = [];
let added = true;
while (added) {
  added = false;
  for (const q of queues) {
    if (q.length) { ordered.push(q.shift()); added = true; }
  }
}

// 하루 perDay 개씩 18:00 KST 배정 (i번째 항목 → start + floor(i/perDay)일)
ordered.forEach((it, i) => {
  const d = new Date(start.getTime());
  d.setUTCDate(d.getUTCDate() + Math.floor(i / perDay));
  it.scheduledFor = d.toISOString();
  // 다시 검수 흐름을 타도록 manual/approved였던 것도 planned로(미발행만 대상)
  if (it.status !== 'manual') it.status = 'planned';
});

plan.updatedAt = new Date().toISOString();
writeFileSync(FILE, JSON.stringify(plan, null, 2), 'utf8');

const days = Math.ceil(ordered.length / perDay);
console.log(`일일 재배치 완료: ${ordered.length}건, 시작 ${start.toISOString()} (18:00 KST), 하루 ${perDay}건씩 · ${days}일치`);
ordered.slice(0, 10).forEach((it) => console.log(`  ${it.scheduledFor.slice(0, 10)} 18:00 · ${it.channels[0]} · ${it.id}`));
