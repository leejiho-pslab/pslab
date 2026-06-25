/**
 * 실시간 콘텐츠 현황 대시보드 (HTML 생성)
 *
 * 클라이언트별 격리 저장소의 사이클 이력 + 디자인 스타일을 모아
 * 한 장의 자가 완결형 HTML로 렌더한다. GitHub Pages로 공개하면
 * 사이클마다 갱신되는 "관제실 대시보드"가 된다.
 */
import type { ClientConfig, ClientStore } from './client.js';
import type { CycleRecord } from './orchestrator.js';
import type { DesignStore } from './design.js';
import { StatusBoard } from './board.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtTime(iso?: string): string {
  if (!iso) return '-';
  return iso.replace('T', ' ').slice(0, 16);
}

function trendIcon(t: string): string {
  return { up: '📈', down: '📉', flat: '➡️', 'n/a': '·' }[t] ?? '·';
}

function postCard(rec: CycleRecord): string {
  const img = rec.imageUrl
    ? `<img class="thumb" src="${esc(rec.imageUrl)}" alt="" loading="lazy"/>`
    : `<div class="thumb noimg">이미지 없음</div>`;
  const status = rec.published
    ? `<span class="badge ok">발행됨</span>`
    : rec.review?.pending
      ? `<span class="badge wait">승인 대기</span>`
      : `<span class="badge hold">보류</span>`;
  const links = (rec.posts ?? [])
    .filter((p) => p.ok && p.url)
    .map((p) => `<a href="${esc(p.url)}" target="_blank">${esc(p.platform)} ↗</a>`)
    .join(' ');
  const caption = esc(rec.caption ?? '').slice(0, 140);
  return `
    <div class="card">
      ${img}
      <div class="card-body">
        <div class="card-top">
          <strong>${esc(rec.topic)}</strong> ${status}
        </div>
        <div class="muted">${fmtTime(rec.finishedAt)} · ${esc(rec.suggestedFormat)} · 참여율 ${(rec.avgEngagementRate * 100).toFixed(1)}%</div>
        <div class="caption">${caption}</div>
        <div class="links">${links || '<span class="muted">링크 없음</span>'}</div>
      </div>
    </div>`;
}

function clientSection(
  client: ClientConfig,
  history: CycleRecord[],
  designVersion: number,
): string {
  const board = new StatusBoard({ read: () => history } as any).build([client]);
  const row = board.rows[0];
  const recent = [...history].reverse().slice(0, 8);
  const last = history.at(-1);
  return `
  <section class="client">
    <div class="client-head">
      <h2>${esc(client.name)} <span class="muted">(${esc(client.id)})</span></h2>
      <div class="stats">
        <span>사이클 <b>${row.cycles}</b></span>
        <span>발행률 <b>${(row.publishRate * 100).toFixed(0)}%</b></span>
        <span>참여율 <b>${(row.lastEngagement * 100).toFixed(1)}% ${trendIcon(row.trend)}</b></span>
        <span>검수 <b>${esc(client.reviewMode)}</b></span>
        <span>디자인 <b>v${designVersion}</b></span>
        ${row.pendingApprovals > 0 ? `<span class="warn">⏳ 승인대기 ${row.pendingApprovals}</span>` : ''}
      </div>
      <div class="muted">채널: ${client.targets.map(esc).join(', ')}</div>
    </div>
    ${
      last
        ? `<div class="direction">🧠 다음 방향: ${esc(last.direction.rationale)}</div>`
        : ''
    }
    <div class="cards">
      ${recent.length ? recent.map(postCard).join('') : '<div class="muted">아직 사이클 없음</div>'}
    </div>
  </section>`;
}

export function renderDashboard(
  clients: ClientConfig[],
  store: ClientStore<CycleRecord>,
  designStore: DesignStore,
): string {
  const now = new Date().toISOString();
  let totalCycles = 0;
  let totalPublished = 0;
  const sections = clients
    .map((c) => {
      const history = store.read(c.id);
      totalCycles += history.length;
      totalPublished += history.filter((h) => h.published).length;
      const design = designStore.load(c.id);
      return clientSection(c, history, design.version);
    })
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="300"/>
<title>pslab 콘텐츠 현황</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
    background:#0f1115; color:#e6e6e6; }
  header { padding:20px 24px; border-bottom:1px solid #232733; background:#151823;
    position:sticky; top:0; }
  header h1 { margin:0; font-size:20px; }
  header .sub { color:#8b93a7; font-size:13px; margin-top:4px; }
  .summary { display:flex; gap:18px; flex-wrap:wrap; margin-top:10px; }
  .summary b { color:#ffb454; }
  main { padding:20px 24px; max-width:1100px; margin:0 auto; }
  .client { margin-bottom:34px; }
  .client-head h2 { margin:0 0 6px; font-size:17px; }
  .stats { display:flex; gap:16px; flex-wrap:wrap; font-size:13px; color:#b8c0d0; margin-bottom:4px; }
  .stats b { color:#fff; }
  .muted { color:#8b93a7; font-size:12px; }
  .warn { color:#ffb454; }
  .direction { background:#1a1f2b; border-left:3px solid #ffb454; padding:8px 12px;
    border-radius:6px; font-size:13px; margin:10px 0; color:#c8cedd; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px,1fr)); gap:14px; }
  .card { background:#161a24; border:1px solid #232733; border-radius:10px; overflow:hidden; }
  .thumb { width:100%; aspect-ratio:1/1; object-fit:cover; display:block; background:#0c0e13; }
  .thumb.noimg { display:flex; align-items:center; justify-content:center; color:#5b6273; font-size:13px; }
  .card-body { padding:10px 12px; }
  .card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .caption { font-size:12px; color:#aeb6c6; margin:6px 0; line-height:1.4;
    max-height:3.6em; overflow:hidden; }
  .links a { color:#6db3ff; font-size:12px; text-decoration:none; margin-right:8px; }
  .badge { font-size:11px; padding:2px 7px; border-radius:20px; white-space:nowrap; }
  .badge.ok { background:#163a2a; color:#4ade80; }
  .badge.wait { background:#3a2f16; color:#ffb454; }
  .badge.hold { background:#3a1d1d; color:#ff7a7a; }
  footer { text-align:center; color:#5b6273; font-size:12px; padding:24px; }
</style>
</head>
<body>
  <header>
    <h1>🖥️ pslab 콘텐츠 현황</h1>
    <div class="sub">실시간 대시보드 · 5분마다 자동 새로고침 · 사이클마다 갱신</div>
    <div class="summary">
      <span>클라이언트 <b>${clients.length}</b></span>
      <span>누적 사이클 <b>${totalCycles}</b></span>
      <span>발행 <b>${totalPublished}</b></span>
      <span class="muted">갱신: ${fmtTime(now)} (UTC)</span>
    </div>
  </header>
  <main>
    ${sections || '<div class="muted">아직 데이터가 없습니다.</div>'}
  </main>
  <footer>pslab autopilot · 자동 생성</footer>
</body>
</html>`;
}
