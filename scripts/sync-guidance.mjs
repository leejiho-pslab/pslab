#!/usr/bin/env node
/**
 * 지침 이슈 동기화 — 대시보드 '지침' 탭에서 등록한 깃허브 이슈를 데이터 파일로 반영
 *
 *   [브랜드노트·분석|방향성|감도] <업체명>  → data/clients/<id>/brand-brief.json
 *   [가이드·<채널key>] <업체명>            → data/clients/<id>/channel-guides.json
 *
 * guidance-sync.yml(issues: opened/edited)에서 실행. 반영 후 이슈는 워크플로가 닫는다.
 * 사용: ISSUE_TITLE/ISSUE_BODY 환경변수 필요. PSLAB_CLIENT(기본 pslab).
 */
import { GuidanceStore, parseGuideBody, BRAND_FIELDS } from '../dist/core/guidance.js';

const title = process.env.ISSUE_TITLE ?? '';
const body = process.env.ISSUE_BODY ?? '';
const clientId = process.env.PSLAB_CLIENT ?? 'pslab';
const store = new GuidanceStore('./data/clients');

const CHANNELS = ['instagram', 'threads', 'naver-blog', 'blogger', 'youtube', 'linkedin'];

const brand = title.match(/^\[브랜드노트·(분석|방향성|감도)\]/);
const guide = title.match(/^\[가이드·([a-z-]+)\]/);

if (brand) {
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
