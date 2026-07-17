#!/usr/bin/env python3
import json, base64
SP="/tmp/claude-0/-home-user-pslab/e949e4d9-ac40-56b3-bb03-0a51ce53f94b/scratchpad"
FONT="/home/user/pslab/assets/fonts"
A=json.load(open("/tmp/awk_ref.json")); P=A["photos"]; C=A["cards"]; C2=A.get("cards2",{})
VID=A.get("video")
FACE="__FACE__"

igcaption="""☀️ 여름은, 아이가 가장 활발한 계절

놀이터에서, 물놀이터에서, 주말 나들이에서 —
매일 뛰어노는 아이에게 딱 맞는 여름 룩.

👕 매일 입고 싶은 데일리 스트릿 그래픽 티
🏃 냉감 소재로 시원한 액티브 트레이닝
🏖 자외선 걱정 없는 서핑 래시가드
👖 데님과 버블 그래픽으로 완성하는 트렌디룩

<b>에어워크주니어</b>는 매 시즌 감각적이고 트렌디한 주니어 룩을
'믿고 입히는 고퀄리티'로 제안합니다. 여름 아이템, 5,900원부터.

📍 AWK 에어워크주니어 공식몰 · awkmall.com

―
#에어워크주니어 #AWK #주니어패션 #아동복 #초등학생코디 #키즈패션 #래시가드 #여름아동복 #남아코디 #여아코디 #키즈룩 #주니어브랜드 #아동복추천 #물놀이룩"""

igcaption2="""🔖 저장 필수! 여름방학 필수템 5

방학 시작 전, 이것만 챙기면 우리 아이 여름 준비 끝.

01. 물놀이 래시가드 — 자외선 차단은 기본, 인증샷도 예쁘게 🏖
02. 냉감 트레이닝 — 폭염에도 쿨하게, TG쿨 소재 🧊
03. 데일리 팬츠 — 캠핑·나들이 어디든 편하게 🏕
04. 그래픽 티 — 방학에도 꾸안꾸, 한 장이면 완성 👕
05. 여행 셋업룩 — 캐리어에 쏙, 코디 고민 끝 ✈️

<b>에어워크주니어</b> 여름 아이템, 5,900원부터.
지금 프로필 링크에서 방학룩 준비하세요!

📍 AWK 에어워크주니어 · awkmall.com

―
#에어워크주니어 #여름방학 #방학룩 #아동복 #주니어패션 #물놀이룩 #래시가드 #초등학생코디 #키즈패션 #방학필수템 #아동복추천 #여름아동복 #남아코디 #여아코디"""

def img(k, cls="", cap=""):
    c=f'<figcaption>{cap}</figcaption>' if cap else ''
    return f'<figure class="{cls}"><img src="{P[k]}" loading="lazy">{c}</figure>'

cards_html="".join(f'<div class="slide"><img src="{C[f"card{i}"]}"><span class="sn">{i}/6</span></div>' for i in range(1,7))
cards2_html="".join(f'<div class="slide"><img src="{C2[f"c{i}"]}"><span class="sn">{i}/7</span></div>' for i in range(1,8)) if C2 else ""
sb=[("pair","DAILY","매일이 즐거운 데일리 룩"),("street","STREET","그래픽으로 완성되는 스타일"),
    ("rashgirl","SWIM","자외선 걱정 없이 신나게"),("beachboy","BEACH","여름엔 물놀이까지")]
sb_html="".join(f'<div class="sbc"><img src="{P[k]}"><div class="sbt"><span>{t}</span>{d}</div></div>' for k,t,d in sb)

video_block=(f'<video controls playsinline poster="{P["beachboy"]}" src="data:video/mp4;base64,{VID}"></video>'
  if VID else
  f'<div class="vidph"><img src="{P["beachboy"]}"><div class="vpc"><div class="pbtn">▶</div><p>여름 룩북 무드필름 · 약 24초 (세로 9:16)</p><small>Higgsfield로 실제 룩북 컷을 시네마틱 영상화</small></div></div>')

HTML=f"""<!doctype html><html lang=ko><meta charset=utf8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>AWK 에어워크주니어 · 콘텐츠 레퍼런스</title>
<style>
{FACE}
*{{margin:0;padding:0;box-sizing:border-box}}
:root{{--bg:#ffffff;--soft:#f5f7fb;--ink:#141414;--ink2:#5a5a66;--ink3:#9a9aa6;--line:#e9ebf1;--blue:#1f5fff;--coral:#ff5a1f}}
html{{scroll-behavior:smooth}}
body{{background:var(--bg);color:var(--ink);font-family:'P',sans-serif;-webkit-font-smoothing:antialiased;line-height:1.6}}
.wrap{{max-width:1080px;margin:0 auto;padding:0 22px}}
section{{padding:clamp(46px,7vw,88px) 0;border-bottom:1px solid var(--line)}}
.kick{{display:inline-flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.16em;font-size:13px;color:var(--blue);margin-bottom:18px}}
.kick::before{{content:"";width:26px;height:3px;background:var(--coral)}}
h1{{font-weight:800;font-size:clamp(34px,6vw,62px);line-height:1.06;letter-spacing:-.02em}}
h2{{font-weight:800;font-size:clamp(26px,4vw,40px);line-height:1.14;letter-spacing:-.02em;margin-bottom:8px}}
h3{{font-weight:700;font-size:clamp(18px,2.4vw,23px);margin:0 0 6px}}
p.lead{{color:var(--ink2);font-size:clamp(16px,2vw,20px);margin-top:16px;max-width:62ch}}
.muted{{color:var(--ink3)}}
.hero{{position:relative;min-height:76vh;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;background:#0a0c14}}
.hero-bg{{position:absolute;inset:0}}
.hero-bg img{{width:100%;height:100%;object-fit:cover;object-position:center 30%}}
.hero-bg::after{{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,20,.35),rgba(10,12,20,.05) 42%,rgba(10,12,20,.85))}}
.hero-in{{position:relative;padding:0 clamp(22px,5vw,60px) clamp(40px,6vw,66px);color:#fff}}
.hero .ey{{font-weight:700;letter-spacing:.22em;color:#8fd0ff;font-size:14px;margin-bottom:18px}}
.hero h1 .c{{color:#ff8a4a}}
.hero .lead{{color:#eaeef6}}
.grid{{display:grid;gap:clamp(12px,2vw,20px)}}
.g2{{grid-template-columns:1fr 1fr}}.g3{{grid-template-columns:repeat(3,1fr)}}.g4{{grid-template-columns:repeat(4,1fr)}}
@media(max-width:720px){{.g2,.g3,.g4{{grid-template-columns:1fr 1fr}}}}
figure{{margin:0;border-radius:14px;overflow:hidden;background:var(--soft);border:1px solid var(--line)}}
figure img{{width:100%;display:block;aspect-ratio:1/1;object-fit:cover}}
figure.wide img{{aspect-ratio:16/11}}
figcaption{{font-size:13px;color:var(--ink3);padding:9px 13px}}
.card{{background:#fff;border:1px solid var(--line);border-radius:16px;padding:clamp(18px,2.4vw,26px);box-shadow:0 1px 2px rgba(20,24,40,.04)}}
.chips{{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}}
.chip{{border:1px solid var(--line);background:var(--soft);color:var(--ink2);border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600}}
.chip.b{{color:var(--blue);border-color:#c3d4ff;background:#f0f5ff}} .chip.c{{color:var(--coral);border-color:#ffd0bd;background:#fff2ec}}
.dl{{display:grid;grid-template-columns:auto 1fr;gap:9px 18px;margin-top:4px}}
.dl dt{{color:var(--blue);font-weight:800;font-size:13.5px;white-space:nowrap}}
.dl dd{{color:var(--ink2);font-size:15px}}
.strat{{display:grid;gap:14px;grid-template-columns:repeat(3,1fr);margin-top:24px}}
@media(max-width:720px){{.strat{{grid-template-columns:1fr}}}}
.strat .n{{font-weight:800;color:var(--coral);font-size:12.5px;letter-spacing:.14em}}
.strat h3{{color:var(--ink)}}
.igwrap{{display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:start;margin-top:24px}}
@media(max-width:820px){{.igwrap{{grid-template-columns:1fr}}}}
.carousel{{display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;scroll-snap-type:x mandatory}}
.slide{{position:relative;flex:0 0 auto;width:74%;max-width:330px;scroll-snap-align:center;border-radius:14px;overflow:hidden;border:1px solid var(--line)}}
.slide img{{width:100%;display:block}}
.slide .sn{{position:absolute;top:10px;right:10px;background:rgba(20,20,20,.6);color:#fff;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px}}
.igcap{{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px}}
.igcap .ph{{display:flex;align-items:center;gap:10px;padding-bottom:14px;border-bottom:1px solid var(--line);margin-bottom:14px}}
.igcap .av{{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--coral))}}
.igcap .hn{{font-weight:800;font-size:14px}}
.igcap pre{{white-space:pre-wrap;font-family:'P';font-size:14.5px;color:var(--ink);line-height:1.72}}
.igcap pre b{{color:var(--blue)}}
.blog{{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;margin-top:24px;box-shadow:0 1px 3px rgba(20,24,40,.05)}}
.blog .bh{{padding:clamp(24px,4vw,42px) clamp(22px,4vw,46px) 8px}}
.blog .btag{{color:var(--coral);font-weight:800;font-size:13px}}
.blog h2.bt{{color:var(--ink);font-size:clamp(23px,3.4vw,34px);line-height:1.28;margin:10px 0 10px;font-weight:800}}
.blog .bmeta{{color:var(--ink3);font-size:13px;border-bottom:1px solid var(--line);padding-bottom:16px}}
.blog .bbody{{padding:8px clamp(22px,4vw,46px) clamp(28px,5vw,48px)}}
.blog .bbody h3{{color:var(--ink);margin:30px 0 10px;font-size:clamp(19px,2.5vw,24px);font-weight:800}}
.blog .bbody p{{color:#3a3a46;font-size:16.5px;line-height:1.85;margin:11px 0}}
.blog em{{color:var(--blue);font-style:normal;font-weight:700}}
.binfo{{background:var(--soft);border-radius:12px;padding:18px 20px;margin:24px 0}}
.btags{{color:var(--blue);font-size:14px;font-weight:600;margin-top:16px;line-height:1.9}}
.vwrap{{display:grid;grid-template-columns:.6fr 1.4fr;gap:24px;align-items:start;margin-top:24px}}
@media(max-width:820px){{.vwrap{{grid-template-columns:1fr}}}}
.vstage{{border-radius:16px;overflow:hidden;border:1px solid var(--line);background:#000;max-width:330px;margin:0 auto}}
.vstage video{{width:100%;display:block;aspect-ratio:9/16;object-fit:cover}}
.vidph{{position:relative}} .vidph img{{width:100%;aspect-ratio:9/16;object-fit:cover;display:block}}
.vpc{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:10px;padding:20px;background:rgba(10,12,20,.25);color:#fff}}
.pbtn{{width:62px;height:62px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;padding-left:4px}}
.vpc p{{font-weight:800;font-size:15px}} .vpc small{{color:#dfe4ef;font-size:12.5px;max-width:22ch}}
.sb{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px}}
@media(max-width:620px){{.sb{{grid-template-columns:1fr 1fr}}}}
.sbc{{position:relative;border-radius:11px;overflow:hidden;border:1px solid var(--line)}}
.sbc img{{width:100%;aspect-ratio:9/16;object-fit:cover;display:block}}
.sbt{{position:absolute;left:0;right:0;bottom:0;padding:10px;font-size:11.5px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.8))}}
.sbt span{{display:block;color:#8fd0ff;font-weight:800;letter-spacing:.12em;font-size:9.5px;margin-bottom:2px}}
.yt{{background:var(--soft);border:1px solid var(--line);border-radius:16px;padding:22px;margin-top:8px}}
.yt .ytt{{font-weight:800;font-size:18px;line-height:1.4;margin-bottom:10px}}
.yt .ipt{{background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:13.5px;color:var(--ink2);white-space:pre-wrap;margin:8px 0;line-height:1.7}}
.note{{color:var(--ink3);font-size:13px;margin-top:20px;padding:14px 16px;border:1px dashed var(--line);border-radius:12px;background:var(--soft)}}
.foot{{padding:40px 0 70px;text-align:center;color:var(--ink3);font-size:13px}}
.foot b{{color:var(--blue);letter-spacing:.16em;font-weight:800}}
</style>

<section class="hero">
  <div class="hero-bg"><img src="{P['pair']}"></div>
  <div class="hero-in">
    <div class="ey">CONTENT REFERENCE · PSLAB × AWK 에어워크주니어</div>
    <h1>AWK 에어워크주니어<br>브랜드 & <span class="c">콘텐츠 제안</span></h1>
    <p class="lead">공식몰의 실제 룩북 이미지를 기반으로 만든 인스타그램·네이버 블로그·유튜브 예시 콘텐츠입니다. 밝고 활기찬 주니어 브랜드 톤을 살려 감도 높게 구성했습니다.</p>
  </div>
</section>

<section><div class="wrap">
  <div class="kick">BRAND ANALYSIS</div>
  <h2>믿고 입히는 고퀄리티,<br>가장 트렌디한 주니어 브랜드</h2>
  <p class="lead">에어워크주니어(AWK)는 제이씨물산이 운영하는 <em>주니어(초등~10대) 패션 공식몰</em>입니다. 매 시즌 감각적이고 트렌디한 룩을 합리적인 가격에 제안합니다.</p>
  <div class="grid g4" style="margin-top:26px">
    {img('street','','데일리 스트릿')}
    {img('rashgirl','','서핑 래시가드')}
    {img('sporty','','액티브 스포츠 세트')}
    {img('beachboy','','여름 비치 룩')}
  </div>
  <div class="grid g2" style="margin-top:20px">
    <div class="card">
      <h3>기본 정보</h3>
      <dl class="dl">
        <dt>업종</dt><dd>주니어(초등~10대) 패션 공식 브랜드몰</dd>
        <dt>운영사</dt><dd>제이씨물산 · 공식몰 awkmall.com</dd>
        <dt>자체 브랜드</dt><dd>에어워크주니어(스포티·스트릿) · 메종피치(여아 트렌디) · 에버라스트(유니섹스 액티브)</dd>
        <dt>가격대</dt><dd>여름 아이템 5,900원 ~ 22,900원 (합리적)</dd>
        <dt>유통</dt><dd>자사몰 + 이랜드몰 · W컨셉 · GS SHOP · 키디키디</dd>
      </dl>
    </div>
    <div class="card">
      <h3>톤 & 무드</h3>
      <p class="muted" style="font-size:15px">밝고 활기찬 · 스포티 스트릿 헤리티지(Airwalk) · 자신감 있는 여름 액티브. 아이는 신나게, 부모는 믿고.</p>
      <div class="chips">
        <span class="chip b">#밝고활기찬</span><span class="chip">#스포티스트릿</span><span class="chip c">#여름액티브</span>
        <span class="chip">#고퀄리티</span><span class="chip">#합리적가격</span><span class="chip b">#트렌디</span>
      </div>
      <p class="muted" style="font-size:13.5px;margin-top:14px">컬러 팔레트 — 화이트 / 코발트 블루 / 코랄 오렌지 / 블랙</p>
    </div>
  </div>
  <h3 style="margin-top:32px">여름 시그니처</h3>
  <div class="chips" style="margin-top:12px">
    <span class="chip">서핑 래시가드</span><span class="chip">냉감 트레이닝(TG쿨)</span><span class="chip">바시티 그래픽 세트</span>
    <span class="chip">스트릿 메쉬 티</span><span class="chip">냉감 카고 반바지</span><span class="chip">데님·버블 그래픽</span><span class="chip">초경량 바람막이</span>
  </div>
</div></section>

<section><div class="wrap">
  <div class="kick">CONTENT STRATEGY</div>
  <h2>채널마다 다른 역할,<br>하나의 브랜드 무드</h2>
  <div class="strat">
    <div class="card"><div class="n">INSTAGRAM</div><h3>발견 & 저장</h3><p class="muted" style="font-size:15px">'우리 아이의 여름 룩북' 캐러셀로 시즌 무드를 감각적으로. 엄마들의 저장·공유를 부르는 룩북컷.</p></div>
    <div class="card"><div class="n">NAVER BLOG</div><h3>검색 유입 & 전환</h3><p class="muted" style="font-size:15px">'초등 여름옷·아동복 추천' 검색에 답하는 롱폼. 사이즈·후기 정보로 구매까지 연결.</p></div>
    <div class="card"><div class="n">YOUTUBE</div><h3>무드 각인 & 확산</h3><p class="muted" style="font-size:15px">실제 룩북컷을 시네마틱 영상으로. 브랜드의 활기찬 여름 무드를 30초 안에 각인.</p></div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="kick">① INSTAGRAM · 게시물 2건</div>
  <h2>브랜딩 룩북 + 시즌 저장각,<br>두 결의 콘텐츠</h2>
  <p class="lead">브랜드 무드를 각인하는 <em>룩북형</em>과, 지금 시즌(여름방학)에 반응하는 <em>정보·저장형</em>. 목적이 다른 두 게시물로 도달과 저장을 동시에 노립니다.</p>

  <div style="margin-top:30px"><span class="chip b" style="font-size:13px">POST 1 · 브랜딩 룩북</span></div>
  <h3 style="margin:12px 0 4px">우리 아이의 여름 룩북</h3>
  <div class="igwrap" style="margin-top:14px">
    <div><div class="carousel">{cards_html}</div></div>
    <div class="igcap">
      <div class="ph"><div class="av"></div><div class="hn">awkmall · 에어워크주니어</div></div>
      <pre>{igcaption}</pre>
    </div>
  </div>

  <div style="margin-top:40px"><span class="chip c" style="font-size:13px">POST 2 · 시즌 저장각 (여름방학)</span></div>
  <h3 style="margin:12px 0 4px">여름방학 필수템 TOP 5</h3>
  <p class="muted" style="font-size:14px;margin-bottom:4px">방학 시즌에 맞춘 카운트다운·체크리스트 포맷 — 저장·공유를 부르는 트렌디 구성.</p>
  <div class="igwrap" style="margin-top:14px">
    <div><div class="carousel">{cards2_html}</div></div>
    <div class="igcap">
      <div class="ph"><div class="av"></div><div class="hn">awkmall · 에어워크주니어</div></div>
      <pre>{igcaption2}</pre>
    </div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="kick">② NAVER BLOG · 방문기</div>
  <h2>검색으로 엄마를 부르는 롱폼</h2>
  <div class="blog">
    <div class="bh">
      <div class="btag">초등 여름옷 추천 · 아동복 브랜드</div>
      <h2 class="bt">초등학생 여름 옷 추천 | 에어워크주니어 AWK, 물놀이부터 데일리까지 한 번에</h2>
      <div class="bmeta">에어워크주니어 여름 신상 후기 · 주니어 아동복 · 5,900원부터</div>
    </div>
    <div class="bbody">
      <p>여름이 되면 아이 옷장이 제일 바쁩니다. 땀은 많이 나고, 물놀이도 가야 하고, 그러면서도 요즘 아이들은 <em>예쁘고 트렌디한 옷</em>을 좋아하죠. 매번 따로 사자니 번거롭고요. 그래서 요즘 제가 자주 담는 곳이 <em>에어워크주니어(AWK)</em>입니다.</p>
      {img('pair','wide','밝고 트렌디한 여름 그래픽 티 — 남아·여아 모두')}
      <h3>고퀄리티인데, 가격이 착해요</h3>
      <p>에어워크주니어는 매 시즌 감각적이고 트렌디한 주니어 룩을 <em>높은 퀄리티로</em> 내놓는 브랜드예요. 그런데 여름 아이템이 <em>5,900원부터</em> 시작해서, 한 시즌 입고 크는 아이 옷으로 부담이 적습니다.</p>
      {img('street','wide','데일리로 입기 좋은 스트릿 그래픽 티')}
      <h3>매일 입는 데일리 스트릿</h3>
      <p>등하교, 학원, 친구랑 노는 날 — 매일 입는 옷일수록 편하고 예뻐야 하잖아요. 스마일·바시티 그래픽 티에 카고 반바지나 데님을 매치하면 아이들이 정말 좋아하는 <em>요즘 스타일</em>이 완성돼요.</p>
      <div class="grid g2">
        {img('bubble','wide','버블 그래픽 크롭티 + 데님 (여아)')}
        {img('varsity','wide','바시티 라글란 반팔 (남녀공용)')}
      </div>
      <h3>여름엔 역시 물놀이 — 래시가드</h3>
      <p>물놀이 계획이 있다면 <em>서핑 래시가드</em>는 필수예요. 자외선 차단되고, 배색 디자인이 예뻐서 아이들이 벗기 싫어할 정도. 냉감 트레이닝(TG쿨) 라인은 땀 많은 여름에도 시원하게 입힐 수 있어요.</p>
      {img('rashgirl','wide','자외선 차단 서핑 래시가드 — 물놀이 필수템')}
      <h3>사이즈·구매 팁</h3>
      <p>여유 있는 핏을 원하면 <em>한 사이즈 업</em>을 추천해요. 공식몰(awkmall.com)에 키·몸무게 기반 사이즈 추천이 있어 고르기 쉽고, 이랜드몰·W컨셉·GS SHOP에서도 살 수 있어요.</p>
      <div class="binfo">
        <h3 style="margin-top:0">🛒 구매 정보</h3>
        <dl class="dl">
          <dt>브랜드</dt><dd>에어워크주니어 (AWK) · 제이씨물산</dd>
          <dt>공식몰</dt><dd>awkmall.com</dd>
          <dt>가격대</dt><dd>여름 아이템 5,900원 ~ 22,900원</dd>
          <dt>사이즈</dt><dd>키·몸무게 기반 추천 · 여유핏은 한 사이즈 업</dd>
          <dt>추천</dt><dd>데일리 · 물놀이 · 나들이 · 운동회</dd>
        </dl>
      </div>
      <p>아이 여름옷, 이것저것 따로 고민하지 말고 한 곳에서 트렌디하게 끝내고 싶다면 에어워크주니어 추천해요. 우리 아이의 가장 반짝이는 여름, 예쁘게 입혀주세요!</p>
      <div class="btags">#에어워크주니어 #AWK #초등학생여름옷 #아동복추천 #주니어패션 #래시가드 #키즈코디 #여아코디 #남아코디 #물놀이룩 #여름아동복 #주니어브랜드</div>
    </div>
  </div>
</div></section>

<section><div class="wrap">
  <div class="kick">③ YOUTUBE · 무드필름</div>
  <h2>30초 안에 각인되는 여름 무드</h2>
  <p class="lead">실제 룩북 컷 4개를 <b style="color:var(--blue)">Higgsfield</b>로 시네마틱 영상화해, 데일리 → 스트릿 → 물놀이 → 비치로 이어지는 세로형 여름 무드필름으로 편집했습니다.</p>
  <div class="vwrap">
    <div class="vstage">{video_block}</div>
    <div>
      <div class="sb">{sb_html}</div>
      <div class="yt">
        <div class="ytt">🎬 에어워크주니어 SUMMER 2026 | 우리 아이의 여름 룩북 (데일리·물놀이·스트릿)</div>
        <div class="ipt">가장 활발한 나이의 여름 ☀️ 에어워크주니어(AWK)와 함께.
데일리 스트릿부터 물놀이 래시가드까지, 아이의 여름을 한 편에 담았습니다.

👕 주니어 여름 신상 · 5,900원부터 | awkmall.com
#에어워크주니어 #주니어패션 #아동복 #shorts</div>
        <div class="chips">
          <span class="chip">#shorts</span><span class="chip">에어워크주니어</span><span class="chip">주니어패션</span>
          <span class="chip">아동복</span><span class="chip">여름룩북</span><span class="chip">래시가드</span>
        </div>
      </div>
    </div>
  </div>
  <div class="note">※ 예시 콘텐츠 레퍼런스입니다. 이미지는 공식몰(awkmall.com)의 실제 룩북 컷을 사용했고, 영상은 그 컷을 AI(Higgsfield)로 무빙 처리한 것입니다. 실제 집행 시 원본 고해상도·촬영 소스로 교체하면 완성도를 더 높일 수 있습니다.</div>
</div></section>

<div class="foot"><b>P S L A B</b><br>SNS 채널 자동화 솔루션 · AWK 에어워크주니어 제안용 레퍼런스</div>
</html>"""

# subset fonts
from fontTools import subset as _subset
import io as _io
chars=set(HTML) | set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,·—–-#@()/&:%’‘“”!?→←☀🏃🏖👕👖🎬▶🛒📍📌")
uni=sorted(ord(c) for c in chars if ord(c)>=32)
def sub_w(path):
    f=_subset.load_font(path, _subset.Options(flavor="woff2"))
    opt=_subset.Options(flavor="woff2"); opt.desubroutinize=True
    ss=_subset.Subsetter(options=opt); ss.populate(unicodes=uni); ss.subset(f)
    b=_io.BytesIO(); f.save(b); return base64.b64encode(b.getvalue()).decode()
FACE_CSS="".join(f"@font-face{{font-family:'P';font-weight:{wt};font-display:swap;src:url(data:font/woff2;base64,{sub_w(f'{FONT}/Pretendard-{w}.otf')}) format('woff2');}}"
  for w,wt in [("Regular",400),("Medium",500),("SemiBold",600),("Bold",700),("ExtraBold",800)])
HTML=HTML.replace("__FACE__",FACE_CSS)
open(f"{SP}/awk-reference.html","w").write(HTML)
print("wrote awk-reference.html", len(HTML)//1024,"KB glyphs",len(uni))
