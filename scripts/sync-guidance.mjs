#!/usr/bin/env node
/**
 * 지침 이슈 동기화 — 대시보드 '지침' 탭에서 등록한 깃허브 이슈를 데이터 파일로 반영
 *
 *   [브랜드노트·분석|방향성|감도] <업체명>  → data/clients/<id>/brand-brief.json
 *   [가이드·<채널key>] <업체명>            → data/clients/<id>/channel-guides.json
 *   [디자인피드백] <업체명>                → data/clients/<id>/design.json humanNotes
 *   [레퍼런스·<채널key>] <업체명>          → data/clients/<id>/reference-links.json (pending 적재)
 *   [레퍼런스삭제·<채널key>] <업체명>      → reference-links.json status=removed (학습 제외)
 *   [발행완료·<채널key>] <제목>            → plan.json status=published + published-ledger.json
 *                                            (수동 채널 전용 — 운영자가 대시보드 버튼으로 신고)
 *
 * guidance-sync.yml(issues: opened/edited)에서 실행. 반영 후 이슈는 워크플로가 닫는다.
 * 사용: ISSUE_TITLE/ISSUE_BODY 환경변수 필요. PSLAB_CLIENT(기본 pslab).
 */
import { GuidanceStore, parseGuideBody, BRAND_FIELDS } from '../dist/core/guidance.js';
import { DesignStore } from '../dist/core/design.js';
import { PlanStore } from '../dist/core/plan.js';
import { loadLedger, saveLedger, recordPublish } from '../dist/core/publish-ledger.js';

const title = process.env.ISSUE_TITLE ?? '';
const body = process.env.ISSUE_BODY ?? '';
// 본문 `업체:` 줄이 있으면 그 업체로 스코프 (공유 저장소 — 수정요청 게이트와 같은 규약)
const bodyClient = (body.match(/^업체:\s*(\S+)/m) || [])[1];
const clientId = bodyClient || process.env.PSLAB_CLIENT || 'pslab';
const store = new GuidanceStore('./data/clients');

const CHANNELS = ['instagram', 'threads', 'naver-blog', 'blogger', 'youtube', 'linkedin'];

const brand = title.match(/^\[브랜드노트·(분석|방향성|감도)\]/);
const guide = title.match(/^\[가이드·([a-z-]+)\]/);
const design = title.startsWith('[디자인피드백]');
const ref = title.match(/^\[레퍼런스·([a-z-]+)\]/);
const delref = title.match(/^\[레퍼런스삭제·([a-z-]+)\]/);
const done = title.match(/^\[발행완료·([a-z-]+)\]/);

if (done) {
  // 수동 채널(네이버 블로그)은 시스템이 발행 성공을 감지할 수 없다 — 운영자가 대시보드의
  // "발행 완료" 버튼으로 신고하면 여기서 plan 상태를 published 로 바꾸고 원장에도 남긴다.
  // 원장 기록이 중요하다: plan.json 이 어떤 이유로 되돌아가도 "이미 발행됨"은 지워지지 않는다(ADR-0017).
  const ch = done[1];
  if (!CHANNELS.includes(ch)) { console.log(`알 수 없는 채널: ${ch}`); process.exit(0); }
  const idm = body.match(/\(id:\s*([A-Za-z0-9_-]+)\)/);
  if (!idm) { console.log('본문에 (id: …) 가 없어 건너뜀 — 대상 콘텐츠를 특정할 수 없습니다'); process.exit(0); }
  const itemId = idm[1];
  // 발행 주소 — "발행 주소:" 줄의 URL 우선, 없으면 본문 어디든 네이버 블로그 링크
  let url;
  const um = body.match(/발행\s*주소\s*[:：]([^\n]*)/);
  if (um) url = (um[1].match(/https?:\/\/\S+/) || [])[0];
  if (!url) url = (body.match(/https?:\/\/blog\.naver\.com\/\S+/) || [])[0];
  const planStore = new PlanStore('./data/clients');
  const plan = planStore.load(clientId);
  const item = (plan.items || []).find((i) => i.id === itemId);
  if (!item) { console.log(`plan 에 없는 id: ${itemId} — 건너뜀 (이슈는 열린 채 남습니다)`); process.exit(0); }
  if (item.status === 'published') {
    console.log(`이미 발행됨: ${itemId} — 상태는 그대로, 원장·주소만 보강`);
  } else {
    item.status = 'published';
    item.publishedAt = new Date().toISOString();
  }
  if (url) item.publishedUrl = url;
  plan.updatedAt = new Date().toISOString();
  planStore.save(clientId, plan);
  const ledger = loadLedger('./data/clients', clientId);
  recordPublish(ledger, itemId, [
    { platform: ch, remoteId: `manual-issue-${process.env.ISSUE_NUMBER || 'n/a'}`, url },
  ]);
  saveLedger('./data/clients', clientId, ledger);
  console.log(`발행 완료 기록: ${itemId} (${ch})${url ? ' · ' + url : ''} — 발행된 콘텐츠로 이동`);
} else if (delref) {
  // 레퍼런스 삭제 — 운영자가 대시보드 🗑 버튼으로 접수. removed 로 표시해 이력은 남기되
  // 이후 학습·기획에서는 참고하지 않는다. 같은 링크를 다시 등록하면 pending 으로 부활한다.
  const ch = delref[1];
  if (!CHANNELS.includes(ch)) { console.log(`알 수 없는 채널: ${ch}`); process.exit(0); }
  const urls = body
    .split('\n')
    .map((l) => l.replace(/^[-*·•\s]+/, '').trim())
    .filter((l) => /^https?:\/\//i.test(l))
    .map((l) => l.split(/\s/)[0]);
  if (!urls.length) { console.log('본문에 링크가 없어 건너뜀'); process.exit(0); }
  const r = store.removeReferenceLinks(clientId, ch, urls);
  if (!r.removed) { console.log(`삭제 대상 없음: ${ch} — 이미 삭제됐거나 등록된 적 없는 링크`); process.exit(0); }
  console.log(`레퍼런스 삭제: ${ch} — ${r.removed}건 (이후 학습·기획에서 제외)`);
} else if (ref) {
  // 한 줄 = 링크 1개. "URL 메모" / "URL — 메모" 형태의 메모를 함께 저장.
  // 학습(열람)은 CI가 아니라 Claude 세션의 기획·제작 게이트에서 일어난다 — 여기서는 적재만.
  const ch = ref[1];
  if (!CHANNELS.includes(ch)) { console.log(`알 수 없는 채널: ${ch}`); process.exit(0); }
  const entries = body
    .split('\n')
    .map((l) => l.replace(/^[-*·•\s]+/, '').trim())
    .filter((l) => /^https?:\/\//i.test(l))
    .map((l) => {
      const m = l.match(/^(\S+)\s*(?:[—–-]\s*)?(.*)$/);
      return { url: m[1], note: (m[2] || '').trim() || undefined };
    });
  if (!entries.length) { console.log('본문에 링크가 없어 건너뜀'); process.exit(0); }
  const r = store.addReferenceLinks(clientId, ch, entries);
  console.log(`레퍼런스 링크 적재: ${ch} — 신규 ${r.added}건 (누적 ${r.total}건, 학습은 다음 기획 세션에서)`);
} else if (design) {
  // 본문 각 줄(불릿 기호 제거)을 개별 지시로 누적 — 사람 지시는 AI 메모와 분리 보관
  const notes = body
    .split('\n')
    .map((l) => l.replace(/^[-*·•\s]+/, '').trim())
    .filter(Boolean);
  if (!notes.length) { console.log('본문이 비어 있어 건너뜀'); process.exit(0); }
  const style = new DesignStore('./data/clients').appendHumanNotes(clientId, notes);
  console.log(`디자인 피드백 반영: ${notes.length}건 (누적 ${style.humanNotes?.length ?? 0}건)`);
} else if (brand) {
  const field = BRAND_FIELDS[brand[1]];
  const text = body.trim();
  if (!text) { console.log('본문이 비어 있어 건너뜀'); process.exit(0); }
  store.updateBriefField(clientId, field, text);
  console.log(`브랜드 노트 갱신: ${brand[1]} (${text.length}자)`);
} else if (guide) {
  const ch = guide[1];
  if (!CHANNELS.includes(ch)) { console.log(`알 수 없는 채널: ${ch}`); process.exit(0); }
  const parsed = parseGuideBody(body);
  if (!parsed.topics.length && !parsed.guide) { console.log('본문이 비어 있어 건너뜀'); process.exit(0); }
  store.updateGuide(clientId, ch, parsed);
  console.log(`채널 가이드 갱신: ${ch} (주제 ${parsed.topics.length}개, 가이드 ${parsed.guide.length}자)`);
} else {
  console.log('지침 규약 제목이 아님 — 건너뜀:', title.slice(0, 60));
  process.exit(0);
}
console.log('SYNCED');
