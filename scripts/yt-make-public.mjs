#!/usr/bin/env node
/**
 * 유튜브 공개범위 일괄 전환 — 채널의 unlisted/private 영상을 전부 public으로.
 *
 * CI 전용(시크릿 필요): PSLAB_YOUTUBE_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN.
 * 1) refresh token → access token
 * 2) 채널 업로드 목록 조회(가능하면) + plan.json의 발행 영상 ID 병합
 * 3) status.privacyStatus != 'public' 인 영상을 videos.update로 공개 전환
 *
 * 주의: videos.update에는 youtube(또는 youtube.force-ssl) 스코프가 필요.
 * upload 전용 스코프 토큰이면 403 — 그 경우 OAuth Playground에서
 * 스코프(https://www.googleapis.com/auth/youtube)로 재발급 후 재실행.
 */
import { readFileSync, existsSync } from 'node:fs';

const CID = process.env.PSLAB_YOUTUBE_CLIENT_ID;
const SECRET = process.env.PSLAB_YOUTUBE_CLIENT_SECRET;
const REFRESH = process.env.PSLAB_YOUTUBE_REFRESH_TOKEN;
if (!CID || !SECRET || !REFRESH) {
  console.log('유튜브 시크릿 미설정 — 건너뜀');
  process.exit(0);
}

const API = 'https://www.googleapis.com/youtube/v3';

async function accessToken() {
  const body = new URLSearchParams({
    client_id: CID, client_secret: SECRET, refresh_token: REFRESH, grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const j = await r.json();
  if (!j.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const tok = await accessToken();
const H = { authorization: `Bearer ${tok}` };
const HJ = { ...H, 'content-type': 'application/json' };

// ── 영상 ID 수집: 채널 업로드 전체 + plan.json 발행분 ──
const ids = new Set();
// plan.json (publishedUrl에서 추출)
const planPath = './data/clients/pslab/plan.json';
if (existsSync(planPath)) {
  const plan = JSON.parse(readFileSync(planPath, 'utf8'));
  for (const it of plan.items ?? []) {
    const m = String(it.publishedUrl ?? '').match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{6,})/);
    if (m) ids.add(m[1]);
  }
}
console.log('plan.json 발행 영상:', [...ids].join(', ') || '없음');
// 채널 업로드 목록 (스코프 부족하면 조용히 건너뜀)
try {
  const ch = await (await fetch(`${API}/channels?part=contentDetails&mine=true`, { headers: H })).json();
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) {
    let page = '';
    do {
      const r = await (await fetch(`${API}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50${page ? '&pageToken=' + page : ''}`, { headers: H })).json();
      for (const it of r.items ?? []) ids.add(it.contentDetails.videoId);
      page = r.nextPageToken ?? '';
    } while (page);
    console.log('채널 업로드 포함 총', ids.size, '개');
  }
} catch (e) {
  console.log('업로드 목록 조회 불가(스코프 제한 가능) — plan 영상만 처리:', String(e).slice(0, 120));
}

if (!ids.size) { console.log('처리할 영상 없음'); process.exit(0); }

// ── 상태 조회 → 비공개/일부공개만 전환 ──
const idArr = [...ids];
let changed = 0, already = 0, failed = 0;
for (let i = 0; i < idArr.length; i += 50) {
  const batch = idArr.slice(i, i + 50);
  const r = await (await fetch(`${API}/videos?part=status&id=${batch.join(',')}`, { headers: H })).json();
  for (const v of r.items ?? []) {
    const cur = v.status?.privacyStatus;
    if (cur === 'public') { already++; console.log(`= ${v.id} 이미 공개`); continue; }
    const up = await fetch(`${API}/videos?part=status`, {
      method: 'PUT', headers: HJ,
      body: JSON.stringify({ id: v.id, status: { ...v.status, privacyStatus: 'public' } }),
    });
    if (up.ok) { changed++; console.log(`✓ ${v.id} ${cur} → public`); }
    else {
      failed++;
      const err = await up.json().catch(() => ({}));
      console.log(`✗ ${v.id} 실패:`, err.error?.message ?? up.status);
    }
  }
}
console.log(`\n결과: 전환 ${changed} · 이미 공개 ${already} · 실패 ${failed}`);
if (failed > 0 && changed === 0) {
  console.log('⚠️ 전부 실패면 refresh token 스코프가 upload 전용일 가능성 — OAuth Playground에서 https://www.googleapis.com/auth/youtube 스코프로 재발급 필요');
  process.exit(1);
}
