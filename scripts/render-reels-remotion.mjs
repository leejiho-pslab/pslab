#!/usr/bin/env node
/**
 * 릴스 합성 — Remotion 엔진 (기본). 힉스필드가 소재, Remotion 이 편집을 맡는다.
 *
 *   힉스필드(장면 클립 생성)  →  reel-scenes.json  →  타임라인 IR  →  Remotion 렌더
 *                                                          └─────→ [다음 단계] 캡컷 드래프트
 *
 * 이 스크립트는 데이터 준비와 뒷정리만 한다. 실제 렌더는 video/render.mjs.
 * (Remotion 의존성을 루트 저장소에 끌어오지 않으려고 프로세스를 나눴다)
 *
 *   1) 힉스필드 클립을 video/public/clips/<itemId>/ 로 내려받는다 (URL 바뀔 때만 재다운로드)
 *   2) Pretendard 를 video/public/fonts/ 로 스테이징
 *   3) reel-scenes.json + design-tokens.json → 타임라인 IR
 *   4) video/render.mjs 로 배치 렌더 → docs/shorts/<itemId>/<itemId>.mp4
 *   5) plan.json 의 videoFile·videoSeconds 갱신 + videoFrom 재사용 연결
 *
 * 사용:
 *   node scripts/render-reels-remotion.mjs --client pslab [--only reels-07-27]
 *   node scripts/render-reels-remotion.mjs --client pslab --stage-only   # 렌더 없이 준비만
 *   node scripts/render-reels-remotion.mjs --client pslab --force        # 증분 무시하고 전부 재렌더
 *
 * 증분 렌더: 타임라인이 그대로고 결과물이 있으면 건너뛴다(.remotion-stamp 로 판정).
 * 매일 도는 크론이 안 바뀐 릴스까지 다시 뽑으면 잡 타임아웃을 넘긴다.
 *
 * video/node_modules 가 없으면 조용히 건너뛴다 — CI 를 깨지 않는다(커밋된 영상 유지).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimeline, mergeTheme } from './lib/reel-timeline.mjs';
import { fetchCached } from './lib/download.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = join(ROOT, 'video');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(`--${k}`);
const clientId = arg('client', 'pslab');
const only = arg('only', '');
const stageOnly = has('stage-only');
/** 변경 없는 릴스까지 강제로 다시 뽑는다 (증분 렌더 무시) */
const force = has('force');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ── 입력 확인 ──────────────────────────────────────────────────────────────
const specPath = join(ROOT, 'data/clients', clientId, 'reel-scenes.json');
if (!existsSync(specPath)) { console.log('reel-scenes.json 없음 → 건너뜀'); process.exit(0); }
if (!existsSync(join(VIDEO, 'node_modules'))) {
  console.log('video/node_modules 없음 → Remotion 렌더 건너뜀 (npm ci --prefix video 필요)');
  process.exit(0);
}

const spec = readJson(specPath);
const planPath = join(ROOT, 'data/clients', clientId, 'plan.json');
const plan = readJson(planPath);

const tokensPath = join(ROOT, 'data/clients', clientId, 'design-tokens.json');
let reelTokens = null;
if (existsSync(tokensPath)) {
  try { reelTokens = readJson(tokensPath).reels ?? null; }
  catch (e) { console.warn(`design-tokens.json 파싱 실패 — 기본 테마 사용 (${e.message})`); }
}
// 빈 객체를 "적용됨"으로 찍으면 안 된다 — 가이드가 없는데 있는 줄 알게 된다.
if (reelTokens && Object.keys(reelTokens).length > 0) {
  console.log(`릴스 디자인 토큰 적용: data/clients/${clientId}/design-tokens.json`);
} else {
  console.log('릴스 디자인 토큰 없음 → 코드 기본값 (레퍼런스 학습 대기)');
}
const themes = mergeTheme(reelTokens);

// 워터마크는 클라이언트 설정의 인스타 계정에서 가져온다 (렌더러 하드코딩 금지)
let brand = '@_pslab';
const clientCfgPath = join(ROOT, 'clients', `${clientId}.json`);
if (existsSync(clientCfgPath)) {
  const ig = readJson(clientCfgPath)?.accounts?.instagram;
  if (ig) brand = ig.startsWith('@') ? ig : `@${ig}`;
}

// ── 1) 폰트 스테이징 ───────────────────────────────────────────────────────
const FONT_FILES = ['Pretendard-ExtraBold.otf', 'Pretendard-Bold.otf'];
const fontDir = join(VIDEO, 'public/fonts');
mkdirSync(fontDir, { recursive: true });
for (const f of FONT_FILES) {
  const src = join(ROOT, 'assets/fonts', f);
  if (existsSync(src)) copyFileSync(src, join(fontDir, f));
  else console.warn(`폰트 없음: assets/fonts/${f} → 시스템 폰트로 대체됨`);
}

// ── 2) 힉스필드 클립 다운로드는 scripts/lib/download.mjs 가 맡는다 (프록시 대응) ──

// ── 3) 타임라인 IR 만들기 ──────────────────────────────────────────────────
const propsDir = join(VIDEO, 'out/props');
mkdirSync(propsDir, { recursive: true });
const items = [];
/** 증분 렌더로 건너뛴 항목 — plan.json 갱신에는 그대로 반영해야 한다 */
const skipped = [];

for (const [itemId, cfg] of Object.entries(spec.reels || {})) {
  if (only && only !== itemId) continue;
  if (!plan.items.find((i) => i.id === itemId)) { console.log(`  ${itemId}: plan에 없음 → 건너뜀`); continue; }

  const clipDir = join(VIDEO, 'public/clips', itemId);
  mkdirSync(clipDir, { recursive: true });

  const beats = (cfg.beats || []).filter((b) => /^https?:\/\//.test(b.clip ?? ''));
  if (beats.length < 2) { console.log(`  ${itemId}: 장면 클립 부족(${beats.length}) → 건너뜀`); continue; }

  let allOk = true;
  for (let i = 0; i < beats.length; i++) {
    const ok = await fetchCached(
      beats[i].clip,
      join(clipDir, `scene-${i + 1}.mp4`),
      join(clipDir, `scene-${i + 1}.src`),
    );
    if (!ok) { console.log(`  ${itemId}: 장면${i + 1} 다운로드 실패 → 건너뜀`); allOk = false; break; }
  }
  if (!allOk) continue;

  const timeline = buildTimeline({
    itemId,
    cfg,
    defaults: spec.defaults,
    themes,
    brand,
    resolveClip: (_b, i) => `clips/${itemId}/scene-${i + 1}.mp4`,
  });
  if (!timeline) continue;

  // 스튜디오에서 그대로 열어볼 수 있게 항목별 props 도 남긴다
  writeFileSync(join(propsDir, `${itemId}.json`), JSON.stringify(timeline, null, 2) + '\n');

  const out = join(ROOT, 'docs/shorts', itemId, `${itemId}.mp4`);

  // ── 증분 렌더 ──
  // 매일 도는 크론이 안 바뀐 릴스까지 매번 다시 뽑으면 편당 2~3분이 그대로 쌓여
  // 잡 타임아웃을 넘긴다(실제로 2026-08-01 런이 25분 한도에 걸려 대시보드 커밋까지 통째로
  // 건너뛰었다). 타임라인이 그대로고 결과물이 있으면 건너뛴다.
  const stampPath = join(ROOT, 'docs/shorts', itemId, '.remotion-stamp');
  const stamp = createHash('sha1').update(JSON.stringify(timeline)).digest('hex');
  if (!force && existsSync(out) && existsSync(stampPath) && readFileSync(stampPath, 'utf8').trim() === stamp) {
    console.log(`  · ${itemId}: 변경 없음 → 건너뜀 (--force 로 재렌더)`);
    skipped.push({ itemId, out, props: timeline });
    continue;
  }

  items.push({ itemId, out, props: timeline, stampPath, stamp });
}

if (stageOnly) {
  const all = [...items, ...skipped];
  if (all.length === 0) { console.log('준비할 릴스 없음'); process.exit(0); }
  console.log(`준비 완료 (${all.length}편). 스튜디오로 확인:`);
  console.log(`  cd video && npx remotion studio --props=out/props/${all[0].itemId}.json`);
  process.exit(0);
}

// ── 4) 배치 렌더 ───────────────────────────────────────────────────────────
// 렌더할 게 없어도 아래 plan.json 갱신(videoFrom 재사용 연결)은 계속 가야 한다.
// 여기서 빠져나가면 새 쇼츠가 원본 릴스 영상을 물지 못한 채 남는다.
if (items.length > 0) {
  const manifestPath = join(VIDEO, 'out/manifest.json');
  writeFileSync(manifestPath, JSON.stringify({ items }, null, 2) + '\n');

  const res = spawnSync(process.execPath, ['render.mjs', 'out/manifest.json'], {
    cwd: VIDEO,
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error('Remotion 렌더 실패 → plan.json 갱신 생략 (커밋된 영상 유지)');
    process.exit(1);
  }
} else {
  console.log('새로 렌더할 릴스 없음 (전부 최신)');
}

// ── 5) plan.json 갱신 ──────────────────────────────────────────────────────
let made = 0;
for (const it of items) {
  if (!existsSync(it.out)) continue;
  const item = plan.items.find((i) => i.id === it.itemId);
  item.videoFile = `shorts/${it.itemId}/${it.itemId}.mp4`;
  item.videoSeconds = +(it.props.durationInFrames / it.props.fps).toFixed(2);
  // 다음 실행이 건너뛸 수 있도록 타임라인 지문을 남긴다
  writeFileSync(it.stampPath, it.stamp + '\n');
  made++;
}
// 건너뛴 항목도 plan 값은 맞춰둔다 (스탬프만 같을 뿐 plan 이 비어 있을 수 있다)
for (const it of skipped) {
  const item = plan.items.find((i) => i.id === it.itemId);
  if (!item) continue;
  item.videoFile = `shorts/${it.itemId}/${it.itemId}.mp4`;
  item.videoSeconds = +(it.props.durationInFrames / it.props.fps).toFixed(2);
}

// 유튜브 쇼츠는 **항상** 같은 날 인스타 릴스 영상을 재활용한다 (비용 절감 규칙).
//
// 왜 자동으로 묶나: 기획 단계에서 videoFrom 을 빠뜨리면 쇼츠 영상이 따로 합성되고,
// 더 나쁘게는 쇼츠용 힉스필드 클립을 따로 뽑게 된다. 클립 1개가 7.5크레딧이라
// 한 번 빠뜨릴 때마다 30크레딧(릴스 1편치)이 그냥 샌다. 사람이 매주 기억하는 대신
// 여기서 같은 날짜의 릴스를 찾아 자동으로 연결한다.
//
// 같은 날 릴스가 없으면 건드리지 않는다 — 그건 의도적으로 독립 제작하는 쇼츠다.
const dayOf = (s) => String(s ?? '').slice(0, 10);
let autoLinked = 0;
for (const it of plan.items) {
  if (it.videoFrom) continue;
  if ((it.channels ?? [])[0] !== 'youtube') continue;
  const mate = plan.items.find(
    (x) => x !== it && (x.channels ?? [])[0] === 'instagram' &&
      dayOf(x.scheduledFor) === dayOf(it.scheduledFor) && x.videoFile,
  );
  if (!mate) continue;
  it.videoFrom = mate.id;
  autoLinked++;
  console.log(`  ${it.id}: videoFrom 누락 → 같은 날 릴스(${mate.id}) 자동 연결 [클립 중복 생성 방지]`);
}

// 영상 재사용: videoFrom 이 가리키는 항목의 영상을 그대로 쓴다
// (같은 콘텐츠를 인스타 릴스와 유튜브 쇼츠에 동시 발행할 때 중복 합성을 피한다)
let linked = 0;
for (const it of plan.items) {
  if (!it.videoFrom) continue;
  const src = plan.items.find((x) => x.id === it.videoFrom);
  if (!src?.videoFile) { console.log(`  ${it.id}: 원본(${it.videoFrom}) 영상 없음 → 대기`); continue; }
  if (it.videoFile !== src.videoFile) { it.videoFile = src.videoFile; linked++; }
  if (src.videoSeconds) it.videoSeconds = src.videoSeconds;
}
if (linked > 0) console.log(`  영상 재사용 연결: ${linked}건`);

if (made > 0 || linked > 0 || autoLinked > 0 || skipped.length > 0) {
  plan.updatedAt = new Date().toISOString();
  writeFileSync(planPath, JSON.stringify(plan, null, 2) + '\n');
}
console.log(`릴스 합성 완료(Remotion): 새로 ${made}편 · 유지 ${skipped.length}편`);
