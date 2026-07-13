#!/usr/bin/env python3
import json, base64
SP="/tmp/claude-0/-home-user-pslab/e949e4d9-ac40-56b3-bb03-0a51ce53f94b/scratchpad"
FONT="/home/user/pslab/assets/fonts"
img=json.load(open("/tmp/awk_ig.json"))
fb={w:base64.b64encode(open(f"{FONT}/Pretendard-{w}.otf",'rb').read()).decode() for w in ["Regular","Medium","SemiBold","Bold","ExtraBold"]}
FACE="".join(f"@font-face{{font-family:'P';font-weight:{wt};src:url(data:font/otf;base64,{fb[w]});}}"
  for w,wt in [("Regular",400),("Medium",500),("SemiBold",600),("Bold",700),("ExtraBold",800)])

# 밝은 스포티 룩북: 상단 정사각 이미지 + 하단 텍스트 밴드
CARDS=[
 dict(bg="cover", kind="cover"),
 dict(bg="street", kind="band", tag="DAILY STREET", no="01", ko="매일 입고 싶은\n데일리 스트릿", en="그래픽 티 한 장이면 등굣길도 스타일", accent="blue"),
 dict(bg="active", kind="band", tag="ACTIVE SPORTS", no="02", ko="마음껏 뛰어노는\n액티브 스포츠", en="냉감 트레이닝으로 여름에도 시원하게", accent="coral"),
 dict(bg="beach", kind="band", tag="SUMMER BEACH", no="03", ko="여름엔 물놀이,\n래시가드까지", en="자외선 차단 · 서핑 래시가드 라인업", accent="blue"),
 dict(bg="trendy", kind="band", tag="TRENDY DAILY", no="04", ko="주말 나들이,\n트렌디하게", en="데님과 버블 그래픽으로 감각 있게", accent="coral"),
 dict(bg="close", kind="close"),
]

FACE_CSS=FACE
CSS="""
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#141414;--blue:#1f5fff;--coral:#ff5a1f;--line:#e9e9ee}
body{font-family:'P',sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1080px;height:1350px;background:#fff;overflow:hidden;color:var(--ink)}
.sqimg{width:1080px;height:1080px;object-fit:cover;display:block}
/* band under image */
.band{position:absolute;left:0;right:0;bottom:0;height:286px;background:#fff;padding:24px 54px 0;display:flex;flex-direction:column}
.brow{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.btag{font-weight:800;letter-spacing:.2em;font-size:22px}
.btag.blue{color:var(--blue)} .btag.coral{color:var(--coral)}
.bno{margin-left:auto;font-weight:800;font-size:34px;color:#d7d7de;letter-spacing:.04em}
.bko{font-weight:800;font-size:50px;line-height:1.12;letter-spacing:-.02em}
.ben{font-weight:500;font-size:25px;color:#6b6b76;margin-top:11px}
.accentbar{position:absolute;left:0;bottom:0;width:100%;height:8px}
.accentbar.blue{background:var(--blue)} .accentbar.coral{background:var(--coral)}
/* cover */
.cover .sqimg{height:1350px}
.cov-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,20,.28),rgba(10,12,20,0) 30%,rgba(10,12,20,.08) 60%,rgba(10,12,20,.72))}
.cov-top{position:absolute;top:52px;left:54px;right:54px;display:flex;justify-content:space-between;align-items:center;color:#fff}
.cov-logo{font-weight:800;letter-spacing:.16em;font-size:26px}
.cov-season{font-weight:700;letter-spacing:.24em;font-size:18px;background:#fff;color:var(--ink);padding:7px 14px;border-radius:999px}
.cov-bot{position:absolute;left:54px;right:54px;bottom:104px;color:#fff}
.cov-kick{font-weight:700;letter-spacing:.22em;font-size:22px;color:#8fd0ff;margin-bottom:16px}
.cov-h{font-weight:800;font-size:96px;line-height:1.04;letter-spacing:-.02em;text-shadow:0 6px 40px rgba(0,0,0,.4)}
.cov-sub{font-weight:500;font-size:27px;line-height:1.4;margin-top:18px;color:#eef1f6}
.cov-swipe{position:absolute;right:54px;bottom:64px;color:#fff;font-weight:700;letter-spacing:.16em;font-size:20px}
/* close */
.close-wrap{position:absolute;inset:0;display:flex;flex-direction:column}
.close .sqimg{height:760px}
.close-band{flex:1;background:var(--ink);color:#fff;padding:56px 54px;display:flex;flex-direction:column;justify-content:center}
.close-logo{font-weight:800;letter-spacing:.18em;font-size:26px;color:#8fd0ff;margin-bottom:18px}
.close-h{font-weight:800;font-size:60px;line-height:1.1;letter-spacing:-.02em}
.close-sub{font-weight:500;font-size:26px;color:#c7c7d2;margin-top:18px;line-height:1.55}
.close-price{display:inline-block;margin-top:22px;font-weight:800;font-size:24px;color:var(--ink);background:#fff;padding:9px 18px;border-radius:999px}
"""

def card_html(c):
    src=f"data:image/jpeg;base64,{img[c['bg']]}"
    if c["kind"]=="cover":
        return f"""<section class="card cover">
          <img class="sqimg" src="{src}"><div class="cov-scrim"></div>
          <div class="cov-top"><div class="cov-logo">AWK · 에어워크주니어</div><div class="cov-season">SUMMER 2026</div></div>
          <div class="cov-bot"><div class="cov-kick">우리 아이의 여름 룩북</div>
            <div class="cov-h">가장 활발한<br>나이의 여름</div>
            <div class="cov-sub">놀이터부터 물놀이까지, 매일이 액티브한 아이들에게</div></div>
          <div class="cov-swipe">SWIPE →</div>
        </section>"""
    if c["kind"]=="close":
        return f"""<section class="card close"><div class="close-wrap">
          <img class="sqimg" src="{src}">
          <div class="close-band"><div class="close-logo">AWK · 에어워크주니어</div>
            <div class="close-h">믿고 입히는<br>주니어 브랜드</div>
            <div class="close-sub">고퀄리티 · 감각적인 트렌드 · 합리적인 가격.<br>아이의 여름을, 에어워크주니어와 함께.</div>
            <div><span class="close-price">여름 아이템 5,900원부터</span></div>
          </div></div></section>"""
    a=c["accent"]
    return f"""<section class="card"><img class="sqimg" src="{src}">
      <div class="band">
        <div class="brow"><span class="btag {a}">{c['tag']}</span><span class="bno">{c['no']}</span></div>
        <div class="bko">{c['ko'].replace(chr(10),'<br>')}</div>
        <div class="ben">{c['en']}</div>
        <div class="accentbar {a}"></div>
      </div></section>"""

cards="".join(card_html(c) for c in CARDS)
html=f"<!doctype html><meta charset=utf8><style>{FACE_CSS}{CSS}</style>{cards}"
open(f"{SP}/awk_carousel.html","w").write(html)
print("wrote awk_carousel.html", len(CARDS),"cards")
