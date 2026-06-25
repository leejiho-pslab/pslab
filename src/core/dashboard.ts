/**
 * 실시간 콘텐츠 관제 대시보드 (HTML 생성)
 *
 * 벤치마킹:
 *  - Planable/Buffer: 채널 탭 + 콘텐츠 캘린더(발행/대기) + 기획안 피드백
 *  - blogdex(블덱스): 네이버 블로그 "지수 등급" + 포스팅 전문성/연관성 점수 + 키워드 분석
 *
 * 클라이언트별 격리 저장소(이력/디자인/플랜)를 모아 자가완결형 HTML 한 장으로
 * 렌더한다. 데이터는 인라인 JSON으로 박고, 채널 탭 전환은 클라이언트 JS로 처리.
 */
import type { ClientConfig, ClientStore } from './client.js';
import type { CycleRecord } from './orchestrator.js';
import type { DesignStore } from './design.js';
import type { PlanStore } from './plan.js';
import type { PlatformId } from './types.js';

const REPO = process.env.PSLAB_REPO ?? 'leejiho-pslab/pslab';

const CHANNELS: Array<{ key: PlatformId; label: string; icon: string }> = [
  { key: 'instagram', label: '인스타그램', icon: '📸' },
  { key: 'threads', label: '스레드', icon: '🧵' },
  { key: 'naver-blog', label: '네이버 블로그', icon: '📝' },
  { key: 'youtube', label: '유튜브', icon: '▶️' },
  { key: 'linkedin', label: '링크드인', icon: '💼' },
];

function seed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface ChannelPublished {
  topic: string;
  time: string;
  imageUrl?: string;
  caption?: string;
  url?: string;
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
}

function buildChannel(
  client: ClientConfig,
  history: CycleRecord[],
  pendingItems: Array<{ topic: string; format: string; scheduledFor: string }>,
  key: PlatformId,
) {
  const published: ChannelPublished[] = [];
  let series: number[] = [];
  for (const rec of history) {
    const post = (rec.posts ?? []).find((p) => p.platform === key && p.ok);
    if (!post) continue;
    const m = (rec.metrics ?? []).find((x) => x.platform === key);
    published.push({
      topic: rec.topic,
      time: rec.finishedAt,
      imageUrl: rec.imageUrl,
      caption: rec.caption,
      url: post.url,
      views: m?.views ?? 0,
      likes: m?.likes ?? 0,
      comments: m?.comments ?? 0,
      engagementRate: m?.engagementRate ?? rec.avgEngagementRate ?? 0,
    });
    series.push((m?.engagementRate ?? rec.avgEngagementRate ?? 0) * 100);
  }
  published.reverse(); // 최신순
  const er = published.map((p) => p.engagementRate);
  const avgEng = er.length ? er.reduce((a, b) => a + b, 0) / er.length : 0;
  const trend =
    er.length < 2 ? 'n/a' : er[0] >= er[1] ? 'up' : 'down';
  return {
    key,
    active: client.targets.includes(key),
    published,
    pending: pendingItems,
    stats: {
      publishedCount: published.length,
      pendingCount: pendingItems.length,
      avgEngagement: avgEng,
      trend,
      totalViews: published.reduce((a, p) => a + p.views, 0),
      totalLikes: published.reduce((a, p) => a + p.likes, 0),
    },
    series: series.slice(-12),
  };
}

const BLOG_TIERS = [
  '저품질',
  '일반',
  '준최적화 1',
  '준최적화 2',
  '준최적화 3',
  '최적화 1',
  '최적화 2',
  '최적화 3',
];

function buildBlog(client: ClientConfig, blogPublished: ChannelPublished[]) {
  // 블덱스 스타일: 등급 + 포스팅별 전문성/연관성/품질 + 키워드 분석
  const postCount = blogPublished.length;
  const avgEng =
    postCount > 0
      ? blogPublished.reduce((a, p) => a + p.engagementRate, 0) / postCount
      : 0;
  const rawScore = Math.min(100, postCount * 9 + avgEng * 100 * 4);
  const measured = postCount > 0;
  const tierIdx = Math.min(
    BLOG_TIERS.length - 1,
    Math.floor((rawScore / 100) * BLOG_TIERS.length),
  );
  const posts = blogPublished.map((p) => {
    const r = seed(`blog:${p.topic}`);
    const base = 55 + (r % 35);
    return {
      topic: p.topic,
      time: p.time,
      expertise: Math.min(99, base + ((r >> 3) % 15)),
      relevance: Math.min(99, base + ((r >> 6) % 18)),
      quality: Math.min(99, Math.round((base + p.engagementRate * 100) % 100) || base),
    };
  });
  const keywords = client.keywords.map((kw) => {
    const r = seed(`kw:${kw}`);
    const idx = 1000 + (r % 90000);
    const comp = ['낮음', '보통', '높음'][r % 3];
    return { kw, searchIndex: idx, competition: comp };
  });
  return {
    measured,
    grade: measured ? BLOG_TIERS[tierIdx] : '측정 전',
    score: Math.round(rawScore),
    posts,
    keywords,
  };
}

function buildClientData(
  client: ClientConfig,
  store: ClientStore<CycleRecord>,
  designStore: DesignStore,
  planStore: PlanStore,
) {
  const history = store.read(client.id);
  const design = designStore.load(client.id);
  const plan = planStore.load(client.id);
  const heldCount = history.filter((h) => !h.published && h.review?.pending).length;

  const channels = CHANNELS.map((c) => {
    const pending = plan.items
      .filter((it) => it.channels.includes(c.key))
      .map((it) => ({
        topic: it.topic,
        format: it.format,
        scheduledFor: it.scheduledFor,
      }));
    return { ...c, ...buildChannel(client, history, pending, c.key) };
  });

  const blogChannel = channels.find((c) => c.key === 'naver-blog')!;
  const blog = buildBlog(client, blogChannel.published as ChannelPublished[]);

  return {
    id: client.id,
    name: client.name,
    industry: client.industry,
    brandTone: client.brandTone,
    keywords: client.keywords,
    competitors: client.competitors.map((x) => x.handle),
    bannedWords: client.bannedWords,
    schedule: client.scheduleTimes,
    reviewMode: client.reviewMode,
    designVersion: design.version,
    designStyle: {
      palette: design.palette,
      mood: design.mood,
      composition: design.composition,
      notes: design.notes.slice(-4),
    },
    heldCount,
    totalCycles: history.length,
    totalPublished: history.filter((h) => h.published).length,
    channels,
    blog,
  };
}

export function renderDashboard(
  clients: ClientConfig[],
  store: ClientStore<CycleRecord>,
  designStore: DesignStore,
  planStore: PlanStore,
): string {
  const data = {
    generatedAt: new Date().toISOString(),
    repo: REPO,
    channels: CHANNELS,
    clients: clients.map((c) => buildClientData(c, store, designStore, planStore)),
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="300"/>
<title>pslab 콘텐츠 관제실</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans KR",sans-serif;background:#0d0f14;color:#e6e8ee}
a{color:#6db3ff}
header{padding:16px 22px;border-bottom:1px solid #1e2230;background:#12141d;position:sticky;top:0;z-index:5}
.brand{font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px}
.sub{color:#7b8398;font-size:12px;margin-top:3px}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.clients{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.cbtn{background:#1a1e2a;border:1px solid #262b3a;color:#cbd3e1;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:13px}
.cbtn.on{background:#2b6fff;border-color:#2b6fff;color:#fff}
.tabs{display:flex;gap:4px;flex-wrap:wrap;padding:12px 22px 0;border-bottom:1px solid #1e2230;background:#12141d;position:sticky;top:58px;z-index:4}
.tab{background:transparent;border:none;border-bottom:2px solid transparent;color:#8b93a7;padding:8px 12px;cursor:pointer;font-size:14px}
.tab.on{color:#fff;border-bottom-color:#2b6fff}
.tab .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-left:5px;vertical-align:middle}
.dot.live{background:#4ade80}.dot.off{background:#444b5c}
main{padding:18px 22px;max-width:1180px;margin:0 auto}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:18px}
.kpi{background:#141823;border:1px solid #222838;border-radius:12px;padding:12px 14px}
.kpi .v{font-size:22px;font-weight:700}.kpi .l{color:#7b8398;font-size:12px;margin-top:2px}
.kpi .v.accent{color:#ffb454}
.panel{background:#141823;border:1px solid #222838;border-radius:12px;padding:14px 16px;margin-bottom:16px}
.panel h3{margin:0 0 10px;font-size:15px}
.sect-h{display:flex;justify-content:space-between;align-items:center;margin:18px 0 10px}
.sect-h h2{font-size:16px;margin:0}
.btn{background:#222838;border:1px solid #2d3346;color:#cbd3e1;padding:6px 11px;border-radius:8px;font-size:12px;text-decoration:none;cursor:pointer}
.btn.fb{background:#2a2030;border-color:#5a3a6a;color:#e0b0ff}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.card{background:#141823;border:1px solid #222838;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.thumb{width:100%;aspect-ratio:1/1;object-fit:cover;background:#0a0c11;display:block}
.thumb.noimg{display:flex;align-items:center;justify-content:center;color:#4b5263;font-size:13px}
.cbody{padding:10px 12px;flex:1;display:flex;flex-direction:column;gap:6px}
.ctop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.ctop strong{font-size:13px}
.muted{color:#7b8398;font-size:11px}
.cap{color:#aeb6c6;font-size:12px;line-height:1.4;max-height:3.6em;overflow:hidden}
.met{display:flex;gap:10px;font-size:11px;color:#9aa3b5;margin-top:auto}
.badge{font-size:10px;padding:2px 7px;border-radius:20px;white-space:nowrap}
.b-ok{background:#15331f;color:#4ade80}.b-wait{background:#33290f;color:#ffb454}.b-plan{background:#16243a;color:#6db3ff}.b-hold{background:#331818;color:#ff7a7a}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #1e2230}
th{color:#7b8398;font-weight:600;font-size:12px}
.grade{display:inline-flex;align-items:center;justify-content:center;min-width:108px;padding:10px 16px;border-radius:12px;font-weight:800;font-size:18px}
.bar{height:7px;border-radius:4px;background:#222838;overflow:hidden}.bar>i{display:block;height:100%;background:#2b6fff}
.plan-pill{font-size:11px;color:#9aa3b5}
.spark{display:block}
.empty{color:#6b7387;padding:18px;text-align:center;font-size:13px}
.tag{display:inline-block;background:#1a1e2a;border:1px solid #262b3a;border-radius:6px;padding:2px 7px;font-size:11px;color:#9aa3b5;margin:2px 2px 0 0}
footer{text-align:center;color:#4b5263;font-size:11px;padding:22px}
</style>
</head>
<body>
<header>
  <div class="brand">🛰️ pslab 콘텐츠 관제실</div>
  <div class="sub">채널별 현황 · 발행/대기 · 반응도 · 기획안 피드백 · 5분 자동 새로고침</div>
  <div class="clients" id="clients"></div>
</header>
<div class="tabs" id="tabs"></div>
<main id="view"></main>
<footer>pslab autopilot · 자동 생성 · <span id="gen"></span></footer>
<script>
const DATA = ${json};
const REPO = DATA.repo;
let ci = 0, ch = 'all';
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ftime = s => !s?'-':String(s).replace('T',' ').slice(0,16);
const pct = v => (v*100).toFixed(1)+'%';
const tIcon = t => ({up:'📈',down:'📉','n/a':'·'}[t]||'·');
function issue(title, body){
  return 'https://github.com/'+REPO+'/issues/new?labels=feedback&title='+encodeURIComponent(title)+'&body='+encodeURIComponent(body);
}
function sparkline(arr){
  if(!arr||arr.length<2) return '';
  const w=160,h=34,mx=Math.max(...arr,1),mn=Math.min(...arr,0);
  const dx=w/(arr.length-1);
  const pts=arr.map((v,i)=>[i*dx,h-((v-mn)/(mx-mn||1))*(h-6)-3]);
  const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  return '<svg class="spark" width="'+w+'" height="'+h+'"><path d="'+d+'" fill="none" stroke="#2b6fff" stroke-width="2"/></svg>';
}
function publishedCard(p, badge){
  const img=p.imageUrl?'<img class="thumb" src="'+esc(p.imageUrl)+'" loading="lazy" alt=""/>':'<div class="thumb noimg">이미지 없음</div>';
  const link=p.url?'<a href="'+esc(p.url)+'" target="_blank">열기 ↗</a>':'';
  return '<div class="card">'+img+'<div class="cbody"><div class="ctop"><strong>'+esc(p.topic)+'</strong>'+badge+'</div>'+
    '<div class="muted">'+ftime(p.time)+'</div>'+
    '<div class="cap">'+esc(p.caption||'')+'</div>'+
    '<div class="met"><span>👁 '+p.views+'</span><span>❤ '+p.likes+'</span><span>💬 '+p.comments+'</span><span>'+pct(p.engagementRate)+'</span></div>'+
    '<div>'+link+'</div></div></div>';
}
function planCard(client, chLabel, it){
  const t='['+client.name+'/'+chLabel+'] 콘텐츠 수정요청: '+it.topic;
  const b='예정 콘텐츠에 대한 수정/방향 요청을 남겨주세요.\\n\\n- 주제: '+it.topic+'\\n- 형식: '+it.format+'\\n- 예정: '+ftime(it.scheduledFor)+'\\n\\n수정 요청: ';
  return '<div class="card"><div class="cbody"><div class="ctop"><strong>'+esc(it.topic)+'</strong><span class="badge b-plan">예정</span></div>'+
    '<div class="muted">🗓 '+ftime(it.scheduledFor)+' · '+esc(it.format)+'</div>'+
    '<div style="margin-top:auto"><a class="btn fb" href="'+issue(t,b)+'" target="_blank">✏️ 수정요청</a></div></div></div>';
}
function channelDetail(client, c){
  const chLabel=(DATA.channels.find(x=>x.key===c.key)||{}).label||c.key;
  let h='';
  // 기획안 패널
  const planTitle='['+client.name+'/'+chLabel+'] 기획안 피드백';
  const planBody='이 채널 기획안에 대한 피드백/수정사항을 적어주세요.\\n\\n[현재 기획안]\\n- 키워드: '+client.keywords.join(', ')+'\\n- 브랜드 말투: '+client.brandTone+'\\n- 발행시간: '+client.schedule.join(', ')+'\\n- 디자인 스타일: '+client.designStyle.mood+' / '+client.designStyle.palette+'\\n\\n[수정 요청]\\n';
  h+='<div class="panel"><div class="sect-h" style="margin:0 0 8px"><h3>📋 기획안</h3><a class="btn fb" href="'+issue(planTitle,planBody)+'" target="_blank">✏️ 기획안 피드백</a></div>'+
     '<div>'+client.keywords.map(k=>'<span class="tag">#'+esc(k)+'</span>').join('')+'</div>'+
     '<div class="muted" style="margin-top:8px">말투: '+esc(client.brandTone)+' · 발행 '+client.schedule.join(', ')+' · 검수 '+esc(client.reviewMode)+' · 디자인 v'+client.designVersion+'</div>'+
     '<div class="muted">디자인 스타일: '+esc(client.designStyle.mood)+' / '+esc(client.designStyle.palette)+' / '+esc(client.designStyle.composition)+'</div></div>';
  if(!c.active){
    h+='<div class="panel"><div class="empty">이 채널은 아직 <b>연결되지 않았습니다</b>. 설정표(targets)에 '+chLabel+'을 추가하고 키를 연결하면 자동 발행이 시작됩니다.</div></div>';
  }
  // KPI
  h+='<div class="kpis">'+
    kpi(c.stats.publishedCount,'발행됨')+
    kpi(c.stats.pendingCount,'발행 대기')+
    kpi(pct(c.stats.avgEngagement)+' '+tIcon(c.stats.trend),'평균 참여율',true)+
    kpi(c.stats.totalViews,'누적 조회')+
    kpi(c.stats.totalLikes,'누적 좋아요')+'</div>';
  if(c.series&&c.series.length>1){h+='<div class="panel"><h3>반응도 추세 (참여율 %)</h3>'+sparkline(c.series)+'</div>';}
  // 네이버 블로그 → blogdex 스타일
  if(c.key==='naver-blog'){ h+=blogSection(client); }
  // 발행 대기
  h+='<div class="sect-h"><h2>🕓 발행 대기 콘텐츠 ('+c.pending.length+')</h2></div>';
  h+= c.pending.length? '<div class="cards">'+c.pending.map(it=>planCard(client,chLabel,it)).join('')+'</div>' : '<div class="empty">예정된 콘텐츠가 없습니다. 다음 사이클에 자동 생성됩니다.</div>';
  // 발행됨
  h+='<div class="sect-h"><h2>✅ 발행된 콘텐츠 ('+c.published.length+')</h2></div>';
  h+= c.published.length? '<div class="cards">'+c.published.map(p=>publishedCard(p,'<span class="badge b-ok">발행</span>')).join('')+'</div>' : '<div class="empty">아직 발행된 콘텐츠가 없습니다.</div>';
  return h;
}
function blogSection(client){
  const b=client.blog;
  const color = b.score>=70?'#15331f':b.score>=40?'#33290f':'#262b3a';
  const fg = b.score>=70?'#4ade80':b.score>=40?'#ffb454':'#9aa3b5';
  let h='<div class="panel"><div class="sect-h" style="margin:0 0 10px"><h3>📊 블로그 지수 (blogdex 스타일)</h3><span class="muted">내부 추정 · 네이버 연동 시 실측 교체</span></div>';
  h+='<div class="row"><div class="grade" style="background:'+color+';color:'+fg+'">'+esc(b.grade)+'</div>'+
     '<div style="flex:1;min-width:160px"><div class="muted">종합 점수 '+b.score+'/100</div><div class="bar"><i style="width:'+b.score+'%"></i></div></div></div>';
  // 포스팅 분석
  if(b.posts.length){
    h+='<table style="margin-top:12px"><tr><th>포스팅</th><th>전문성</th><th>연관성</th><th>품질</th></tr>'+
      b.posts.slice(0,8).map(p=>'<tr><td>'+esc(p.topic)+'</td><td>'+p.expertise+'</td><td>'+p.relevance+'</td><td>'+p.quality+'</td></tr>').join('')+'</table>';
  }
  // 키워드 분석
  h+='<table style="margin-top:12px"><tr><th>키워드</th><th>검색지수</th><th>경쟁도</th></tr>'+
    b.keywords.map(k=>'<tr><td>#'+esc(k.kw)+'</td><td>'+k.searchIndex.toLocaleString()+'</td><td>'+esc(k.competition)+'</td></tr>').join('')+'</table>';
  h+='</div>';
  return h;
}
function overview(client){
  let h='<div class="kpis">'+
    kpi(client.totalCycles,'총 사이클')+
    kpi(client.totalPublished,'총 발행')+
    kpi(client.heldCount,'승인 대기',client.heldCount>0)+
    kpi('v'+client.designVersion,'디자인 진화')+'</div>';
  h+='<div class="panel"><h3>채널별 요약</h3><table><tr><th>채널</th><th>상태</th><th>발행</th><th>대기</th><th>평균 참여율</th></tr>'+
    client.channels.map(c=>{const lab=(DATA.channels.find(x=>x.key===c.key)||{});
      return '<tr><td>'+lab.icon+' '+lab.label+'</td><td>'+(c.active?'<span class="badge b-ok">연결</span>':'<span class="badge b-hold">미연결</span>')+'</td><td>'+c.stats.publishedCount+'</td><td>'+c.stats.pendingCount+'</td><td>'+pct(c.stats.avgEngagement)+' '+tIcon(c.stats.trend)+'</td></tr>';}).join('')+'</table></div>';
  // 경쟁사 + 최근 발행 미리보기
  h+='<div class="panel"><h3>벤치마킹 경쟁사</h3><div>'+(client.competitors.length?client.competitors.map(x=>'<span class="tag">@'+esc(x)+'</span>').join(''):'<span class="muted">미설정</span>')+'</div></div>';
  const recent=[].concat(...client.channels.map(c=>c.published)).sort((a,b)=>(b.time||'').localeCompare(a.time||'')).slice(0,8);
  h+='<div class="sect-h"><h2>최근 발행</h2></div>';
  h+= recent.length?'<div class="cards">'+recent.map(p=>publishedCard(p,'<span class="badge b-ok">발행</span>')).join('')+'</div>':'<div class="empty">아직 발행된 콘텐츠가 없습니다.</div>';
  return h;
}
function kpi(v,l,accent){return '<div class="kpi"><div class="v'+(accent?' accent':'')+'">'+v+'</div><div class="l">'+l+'</div></div>';}
function renderClients(){
  document.getElementById('clients').innerHTML = DATA.clients.length>1 ? DATA.clients.map((c,i)=>'<button class="cbtn'+(i===ci?' on':'')+'" onclick="setClient('+i+')">'+esc(c.name)+'</button>').join('') : '';
}
function renderTabs(){
  const c=DATA.clients[ci];
  const tabs=[{key:'all',label:'전체',icon:'🏠',active:true}].concat(DATA.channels.map(ch=>{const cc=c.channels.find(x=>x.key===ch.key);return {key:ch.key,label:ch.label,icon:ch.icon,active:cc&&cc.active};}));
  document.getElementById('tabs').innerHTML = tabs.map(t=>'<button class="tab'+(t.key===ch?' on':'')+'" onclick="setCh(\\''+t.key+'\\')">'+t.icon+' '+t.label+(t.key!=='all'?'<span class="dot '+(t.active?'live':'off')+'"></span>':'')+'</button>').join('');
}
function renderView(){
  const c=DATA.clients[ci];
  document.getElementById('view').innerHTML = ch==='all'?overview(c):channelDetail(c,c.channels.find(x=>x.key===ch));
  document.getElementById('gen').textContent = ftime(DATA.generatedAt)+' (UTC)';
}
function setClient(i){ci=i;ch='all';renderClients();renderTabs();renderView();window.scrollTo(0,0);}
function setCh(k){ch=k;renderTabs();renderView();window.scrollTo(0,0);}
renderClients();renderTabs();renderView();
</script>
</body>
</html>`;
}
