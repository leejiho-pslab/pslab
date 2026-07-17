#!/usr/bin/env python3
# AWK 인스타 2번째 캐러셀 — "여름방학 필수템 TOP 5" (풀블리드 포스터 + 스티커 넘버, 트렌디 저장각)
import json, base64
SP="/tmp/claude-0/-home-user-pslab/e949e4d9-ac40-56b3-bb03-0a51ce53f94b/scratchpad"
FONT="/home/user/pslab/assets/fonts"
img=json.load(open("/tmp/awk_ig2.json"))
fb={w:base64.b64encode(open(f"{FONT}/Pretendard-{w}.otf",'rb').read()).decode() for w in ["Regular","Medium","SemiBold","Bold","ExtraBold"]}
FACE="".join(f"@font-face{{font-family:'P';font-weight:{wt};src:url(data:font/otf;base64,{fb[w]});}}"
  for w,wt in [("Regular",400),("Medium",500),("SemiBold",600),("Bold",700),("ExtraBold",800)])

ITEMS=[
 dict(bg="water", no="01", a="coral", tag="물놀이 성수기", ko="래시가드는\n무조건 챙겨야지", tip="자외선 차단, 인증샷도 예쁘게"),
 dict(bg="cool", no="02", a="blue", tag="폭염 대비", ko="더워도 쿨하게,\n냉감 트레이닝", tip="TG쿨 소재로 땀 많은 여름도 시원하게"),
 dict(bg="camp", no="03", a="coral", tag="캠핑 · 나들이", ko="어디서든 편한\n데일리 팬츠", tip="카고·데님으로 활동성과 스타일 UP"),
 dict(bg="daily", no="04", a="blue", tag="방학 데일리", ko="방학에도\n꾸안꾸 그래픽 티", tip="한 장만 걸쳐도 완성되는 요즘 스타일"),
 dict(bg="travel", no="05", a="coral", tag="여행 · 바캉스", ko="캐리어에 쏙,\n여행 셋업룩", tip="위아래 딱 맞춘 세트로 코디 고민 끝"),
]

CSS="""
*{margin:0;padding:0;box-sizing:border-box}
:root{--ink:#141414;--blue:#1f5fff;--coral:#ff4d17;--cream:#fff7ee}
body{font-family:'P',sans-serif;-webkit-font-smoothing:antialiased}
.card{position:relative;width:1080px;height:1350px;overflow:hidden;background:#000;color:#fff}
.full{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,16,.42) 0%,rgba(8,10,16,0) 26%,rgba(8,10,16,.05) 46%,rgba(8,10,16,.62) 72%,rgba(8,10,16,.9) 100%)}
/* sticker number */
.numsticker{position:absolute;top:52px;left:52px;display:flex;align-items:center;gap:16px;transform:rotate(-3deg)}
.numbox{width:118px;height:118px;border-radius:26px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:66px;color:#fff;box-shadow:0 12px 30px rgba(0,0,0,.28);border:4px solid #fff}
.numbox.coral{background:var(--coral)} .numbox.blue{background:var(--blue)}
.numof{font-weight:800;font-size:30px;color:#fff;background:rgba(0,0,0,.4);padding:8px 14px;border-radius:999px;backdrop-filter:blur(4px)}
.savepill{position:absolute;top:64px;right:52px;font-weight:800;font-size:26px;color:var(--ink);background:#fff;padding:12px 20px;border-radius:999px;box-shadow:0 8px 22px rgba(0,0,0,.25);transform:rotate(3deg)}
/* bottom block */
.blk{position:absolute;left:54px;right:54px;bottom:112px}
.tagpill{display:inline-block;font-weight:800;letter-spacing:.04em;font-size:26px;color:#fff;padding:9px 20px;border-radius:999px;margin-bottom:20px}
.tagpill.coral{background:var(--coral)} .tagpill.blue{background:var(--blue)}
.h{font-weight:800;font-size:70px;line-height:1.1;letter-spacing:-.02em;text-shadow:0 4px 30px rgba(0,0,0,.5)}
.tip{font-weight:600;font-size:25px;color:#f0f2f8;margin-top:14px;text-shadow:0 2px 16px rgba(0,0,0,.7);display:flex;gap:10px;align-items:flex-start;line-height:1.35}
.tip::before{content:"✓";color:#7dff9e;font-weight:800}
/* cover */
.ribbon{position:absolute;top:0;left:0;right:0;background:var(--coral);color:#fff;font-weight:800;letter-spacing:.22em;font-size:24px;text-align:center;padding:16px 0}
.cov-mid{position:absolute;left:54px;right:54px;bottom:120px}
.cov-kick{font-weight:800;font-size:30px;color:#ffd36b;margin-bottom:18px;letter-spacing:.02em}
.cov-h{font-weight:800;font-size:118px;line-height:1.0;letter-spacing:-.03em;text-shadow:0 6px 40px rgba(0,0,0,.5)}
.cov-h .u{color:#ffd36b}
.cov-save{display:inline-block;margin-top:26px;font-weight:800;font-size:30px;color:var(--ink);background:#fff;padding:13px 24px;border-radius:999px}
.cov-swipe{position:absolute;right:54px;bottom:60px;font-weight:800;letter-spacing:.14em;font-size:22px;color:#fff}
.cov-logo{position:absolute;top:66px;left:54px;font-weight:800;letter-spacing:.14em;font-size:26px;color:#fff}
/* close (recap checklist) */
.rc{position:absolute;inset:0;background:var(--coral);color:#fff;padding:80px 64px;display:flex;flex-direction:column}
.rc-logo{font-weight:800;letter-spacing:.14em;font-size:28px;margin-bottom:8px;color:#ffe6d5}
.rc-h{font-weight:800;font-size:70px;line-height:1.1;letter-spacing:-.02em;margin-bottom:34px}
.rc-list{display:flex;flex-direction:column;gap:22px;flex:1}
.rc-li{display:flex;align-items:center;gap:20px;font-weight:700;font-size:40px}
.rc-ck{width:56px;height:56px;border-radius:14px;background:#fff;color:var(--coral);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:34px;flex:none}
.rc-cta{margin-top:30px;background:#141414;border-radius:22px;padding:28px 32px;display:flex;justify-content:space-between;align-items:center}
.rc-cta b{font-weight:800;font-size:38px} .rc-cta span{font-weight:800;font-size:30px;color:#ffd36b}
.rc-sub{font-weight:600;font-size:26px;color:#ffe6d5;margin-top:16px;text-align:center}
"""

def cover():
    return f"""<section class="card">
      <img class="full" src="data:image/jpeg;base64,{img['cover']}"><div class="scrim"></div>
      <div class="ribbon">SUMMER VACATION · 2026</div>
      <div class="cov-logo">AWK · 에어워크주니어</div>
      <div class="cov-mid">
        <div class="cov-kick">🔖 방학 시작 전 저장 필수</div>
        <div class="cov-h">여름방학<br><span class="u">필수템</span> 5</div>
        <div class="cov-save">이거 5개면 방학룩 끝!</div>
      </div>
      <div class="cov-swipe">SWIPE →</div>
    </section>"""

def item(c):
    return f"""<section class="card">
      <img class="full" src="data:image/jpeg;base64,{img[c['bg']]}"><div class="scrim"></div>
      <div class="numsticker"><div class="numbox {c['a']}">{c['no']}</div><div class="numof">/ 05</div></div>
      <div class="savepill">저장각 🔖</div>
      <div class="blk">
        <span class="tagpill {c['a']}">{c['tag']}</span>
        <div class="h">{c['ko'].replace(chr(10),'<br>')}</div>
        <div class="tip">{c['tip']}</div>
      </div>
    </section>"""

def close():
    recap=[("01","물놀이 래시가드"),("02","냉감 트레이닝"),("03","데일리 팬츠"),("04","그래픽 티"),("05","여행 셋업")]
    lis="".join(f'<div class="rc-li"><div class="rc-ck">✓</div>{no}. {t}</div>' for no,t in recap)
    return f"""<section class="card"><div class="rc">
      <div class="rc-logo">AWK · 에어워크주니어</div>
      <div class="rc-h">방학 준비,<br>이걸로 끝!</div>
      <div class="rc-list">{lis}</div>
      <div class="rc-cta"><b>여름방학 특가</b><span>5,900원부터</span></div>
      <div class="rc-sub">프로필 링크 → awkmall.com 에서 지금 담기</div>
    </div></section>"""

cards=cover()+"".join(item(c) for c in ITEMS)+close()
html=f"<!doctype html><meta charset=utf8><style>{FACE}{CSS}</style>{cards}"
open(f"{SP}/awk_carousel2.html","w").write(html)
print("wrote awk_carousel2.html", 2+len(ITEMS),"cards")
