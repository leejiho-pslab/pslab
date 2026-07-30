#!/usr/bin/env python3
# AWK 유튜브 무드필름 오버레이 (1080x1920): intro/outro 불투명, 자막4 투명
import base64, subprocess, os
SP="/tmp/claude-0/-home-user-pslab/e949e4d9-ac40-56b3-bb03-0a51ce53f94b/scratchpad"
FONT="/home/user/pslab/assets/fonts"
fb={w:base64.b64encode(open(f"{FONT}/Pretendard-{w}.otf",'rb').read()).decode()
    for w in ["Regular","Medium","SemiBold","Bold","ExtraBold"]}
FACE="".join(f"@font-face{{font-family:'P';font-weight:{wt};src:url(data:font/otf;base64,{fb[w]});}}"
  for w,wt in [("Regular",400),("Medium",500),("SemiBold",600),("Bold",700),("ExtraBold",800)])
CSS=f"""
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:1080px;height:1920px;font-family:'P',sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}}
.stage{{position:relative;width:1080px;height:1920px}}
.solid{{background:#ffffff}}
.center{{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:0 100px;color:#141414}}
.season{{font-weight:700;letter-spacing:.24em;font-size:30px;color:#fff;background:#1f5fff;padding:10px 22px;border-radius:999px;margin-bottom:40px}}
.logo{{font-weight:800;letter-spacing:.16em;font-size:34px;margin-bottom:22px}}
.title{{font-weight:800;font-size:120px;line-height:1.04;letter-spacing:-.02em}}
.title .b{{color:#1f5fff}} .title .c{{color:#ff5a1f}}
.rule{{width:96px;height:8px;background:#ff5a1f;margin:52px auto}}
.sub{{font-weight:500;font-size:40px;line-height:1.55;color:#5a5a66}}
.small{{font-weight:700;font-size:28px;letter-spacing:.04em;color:#141414;margin-top:52px;background:#f1f3f8;padding:12px 22px;border-radius:999px}}
/* caption overlay (transparent) */
.scrim{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,20,.15) 0%,rgba(10,12,20,0) 30%,rgba(10,12,20,0) 55%,rgba(10,12,20,.80) 100%)}}
.cap{{position:absolute;left:78px;right:78px;bottom:150px;color:#fff}}
.tagpill{{display:inline-block;font-weight:800;letter-spacing:.18em;font-size:30px;color:#fff;padding:9px 20px;border-radius:999px;margin-bottom:22px}}
.tagpill.b{{background:#1f5fff}} .tagpill.c{{background:#ff5a1f}}
.kln{{font-weight:800;font-size:86px;line-height:1.08;text-shadow:0 4px 26px rgba(0,0,0,.5)}}
.eln{{font-weight:500;font-size:36px;color:#eef1f6;margin-top:18px;text-shadow:0 2px 16px rgba(0,0,0,.7)}}
"""
def page(inner): return f"<!doctype html><meta charset=utf8><style>{FACE}{CSS}</style>{inner}"
pages={
 "intro": page("""<div class="stage solid"><div class="center">
   <div class="season">SUMMER 2026</div>
   <div class="logo">AWK · 에어워크주니어</div>
   <div class="title">가장 활발한<br><span class="b">나이</span>의 <span class="c">여름</span></div>
   <div class="rule"></div>
   <div class="sub">우리 아이의 여름 룩북</div></div></div>"""),
 "outro": page("""<div class="stage solid"><div class="center">
   <div class="logo" style="color:#1f5fff">AWK · 에어워크주니어</div>
   <div class="title" style="font-size:92px">믿고 입히는<br>주니어 브랜드</div>
   <div class="rule"></div>
   <div class="sub">고퀄리티 · 트렌디 · 합리적인 가격<br>여름 아이템 5,900원부터</div>
   <div class="small">awkmall.com · @awkmall</div></div></div>"""),
 "cap_beach": page('<div class="stage"><div class="scrim"></div><div class="cap"><div class="tagpill b">SUMMER BEACH</div><div class="kln">여름엔 물놀이,<br>래시가드까지</div></div></div>'),
 "cap_pair": page('<div class="stage"><div class="scrim"></div><div class="cap"><div class="tagpill c">DAILY LOOK</div><div class="kln">매일이 즐거운<br>데일리 룩</div></div></div>'),
 "cap_rash": page('<div class="stage"><div class="scrim"></div><div class="cap"><div class="tagpill b">SWIM &amp; PLAY</div><div class="kln">자외선 걱정 없이<br>신나게</div></div></div>'),
 "cap_street": page('<div class="stage"><div class="scrim"></div><div class="cap"><div class="tagpill c">STREET CASUAL</div><div class="kln">그래픽 한 장으로<br>완성되는 스타일</div></div></div>'),
}
os.makedirs(f"{SP}/awk_ov", exist_ok=True)
CH="/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
for name,html in pages.items():
    hp=f"{SP}/awk_ov/{name}.html"; open(hp,"w").write(html)
    subprocess.run([CH,"--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
        "--force-device-scale-factor=1","--window-size=1080,1920","--default-background-color=00000000",
        "--virtual-time-budget=2500",f"--screenshot={SP}/awk_ov/{name}.png",f"file://{hp}"],
        stderr=subprocess.DEVNULL)
    print("rendered",name)
