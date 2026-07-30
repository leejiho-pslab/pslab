#!/usr/bin/env node
/**
 * 레퍼런스·벤치마킹 수집 — 인스타그램 Business Discovery
 *
 * clients/<id>.json 의 benchmarks.instagram 계정들의 최근 게시물(이미지·캡션·좋아요/댓글)을
 * 우리 인스타 비즈니스 계정 토큰으로 조회해 data/clients/<id>/references.json 에 저장한다.
 *  - Business Discovery 는 **공개 비즈니스/크리에이터 계정**만 반환. 개인·비공개는 에러 → 자동 스킵.
 *  - 이미지 URL(fbcdn)은 몇 시간 뒤 만료되므로 docs/references/<id>/ 로 **다운로드**해 로컬 경로 저장.
 *  - CI(네트워크 열림)에서 실행. 대시보드 "🔍 레퍼런스·벤치마킹" 패널의 소스.
 *
 * 필요 env(기존 발행 토큰 재사용): PSLAB_INSTAGRAM_ACCESS_TOKEN, PSLAB_INSTAGRAM_IG_USER_ID
 * 사용: node scripts/fetch-references.mjs --client dongsung
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const clientId = arg('client', 'pslab');
const dir = join(ROOT, 'data/clients', clientId);
if (!existsSync(dir)) { console.log('데이터 폴더 없음 — 건너뜀'); process.exit(0); }

const API = 'https://graph.facebook.com/v21.0';
const token = process.env.PSLAB_INSTAGRAM_ACCESS_TOKEN;
const igUserId = process.env.PSLAB_INSTAGRAM_IG_USER_ID;

// 벤치마킹 계정 로드
let benchmarks = [];
try {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'clients', `${clientId}.json`), 'utf8'));
  const b = cfg.benchmarks;
  benchmarks = Array.isArray(b) ? b : (b && Array.isArray(b.instagram) ? b.instagram : []);
} catch { /* 설정 없음 */ }
benchmarks = benchmarks.map((s) => String(s).replace(/^@/, '').trim()).filter(Boolean);

if (!benchmarks.length) { console.log('벤치마킹 계정 없음 — clients/<id>.json 의 benchmarks.instagram 설정 필요'); process.exit(0); }
if (!token || !igUserId) { console.log('인스타 자격증명 없음(PSLAB_INSTAGRAM_ACCESS_TOKEN / _IG_USER_ID) — CI 시크릿 필요. 건너뜀'); process.exit(0); }

const MED = 'caption,media_url,permalink,like_count,comments_count,media_type,thumbnail_url,timestamp';

async function discover(username) {
  const fields = `business_discovery.username(${username}){username,name,followers_count,media_count,media.limit(12){${MED}}}`;
  const url = `${API}/${igUserId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.code || ''} ${j.error.message || JSON.stringify(j.error)}`.trim());
  return j.business_discovery;
}

const imgDir = join(ROOT, 'docs/references', clientId);
mkdirSync(imgDir, { recursive: true });
async function download(u, dest) {
  try {
    const r = await fetch(u);
    if (!r.ok) return false;
    writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch { return false; }
}

const accounts = [];
for (const uname of benchmarks) {
  try {
    const bd = await discover(uname);
    const media = [];
    let i = 0;
    for (const m of (bd.media && bd.media.data ? bd.media.data : [])) {
      const src = (m.media_type === 'VIDEO') ? (m.thumbnail_url || m.media_url) : m.media_url;
      let image = null;
      if (src) {
        const fn = `${uname}-${i}.jpg`;
        if (await download(src, join(imgDir, fn))) image = `references/${clientId}/${fn}`;
      }
      media.push({
        permalink: m.permalink || null,
        image,
        caption: (m.caption || '').replace(/\s+/g, ' ').slice(0, 280),
        likes: m.like_count || 0,
        comments: m.comments_count || 0,
        type: m.media_type || 'IMAGE',
        ts: m.timestamp || null,
      });
      i++;
    }
    accounts.push({
      username: bd.username || uname,
      name: bd.name || uname,
      followers: bd.followers_count || 0,
      mediaCount: bd.media_count || 0,
      media,
    });
    console.log(`✓ @${uname}: ${media.length}컷 (팔로워 ${bd.followers_count || 0})`);
  } catch (e) {
    console.log(`✗ @${uname} 스킵: ${e.message}`);
  }
}

const out = {
  source: 'instagram-business-discovery',
  note: '내부 벤치마킹·감도 참고용(재게시 금지). 공개 비즈니스/크리에이터 계정만 수집됨.',
  baseDate: new Date().toISOString().slice(0, 10),
  accounts,
};
writeFileSync(join(dir, 'references.json'), JSON.stringify(out, null, 2));
console.log(`레퍼런스 저장: ${accounts.length}/${benchmarks.length} 계정 → data/clients/${clientId}/references.json`);
if (!accounts.length) console.log('⚠ 수집 0건 — 토큰 스코프(instagram_basic) 또는 대상 계정 공개여부 확인');
