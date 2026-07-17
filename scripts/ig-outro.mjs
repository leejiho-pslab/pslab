/**
 * 인스타 캐러셀 공통 마감 장표 (강점 + 위치 + 연락처)
 *  - 모든 인스타 카드뉴스(캐러셀)의 "맨 마지막 슬라이드"로 동일하게 붙는다.
 *  - render-cards.mjs / render-ig.mjs 양쪽에서 outroHTML(faces)로 렌더하고
 *    slideImages 끝에 outroRel(clientId)을 append 한다.
 *  - 프리미엄 딥네이비 + 금색 + 브랜드 레드 포인트. 하단 세이프존(135px) 준수.
 */
export const OUTRO_FILE = '_outro.png';
export const outroRel = (clientId) => `cards/${clientId}/${OUTRO_FILE}`;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 강점 4가지 (브랜드 브리프의 차별점 요약)
// 예시 강점 — 업체별로 교체
const STRENGTHS = [
  '핵심 강점 ①',
  '핵심 강점 ②',
  '핵심 강점 ③',
  '핵심 강점 ④',
];

export function outroHTML(faces) {
  const checks = STRENGTHS.map((s) => `<li><span class="ck">✓</span><span>${esc(s)}</span></li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${faces}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;word-break:keep-all;text-wrap:pretty}
html,body{width:1080px;height:1350px;font-family:'Pretendard';background:#0a1020}
.card{width:1080px;height:1350px;position:relative;overflow:hidden;color:#fff;
  background:radial-gradient(120% 80% at 50% -10%,#16233c 0%,#0c1526 46%,#080e1c 100%)}
.frame{position:absolute;inset:40px;border:1.5px solid rgba(210,175,110,.38);border-radius:20px}
.stage{position:absolute;inset:0;display:flex;flex-direction:column;padding:120px 96px 135px}
.kick{font-weight:700;font-size:28px;letter-spacing:.32em;color:#d9b877;text-transform:uppercase}
.kick .dot{color:#ff5a4d}
.brand{margin-top:22px;font-family:'Myeongjo','Pretendard';font-weight:800;font-size:84px;letter-spacing:-.01em;line-height:1.14}
.brand em{color:#e9c987;font-style:normal}
.slogan{margin-top:20px;font-weight:500;font-size:33px;line-height:1.5;color:#c3cde0}
.rule{margin:40px 0 4px;height:2px;background:linear-gradient(90deg,#d9b877,rgba(217,184,119,0))}
.str{list-style:none;margin-top:30px;display:flex;flex-direction:column;gap:24px}
.str li{display:flex;align-items:center;gap:22px;font-weight:600;font-size:39px;color:#eef2f8}
.str .ck{flex:0 0 auto;width:52px;height:52px;border-radius:50%;background:#e9c987;color:#0c1526;
  font-weight:800;font-size:32px;display:flex;align-items:center;justify-content:center}
.contact{margin-top:auto;background:rgba(255,255,255,.05);border-left:8px solid #ff5a4d;
  border-radius:14px;padding:34px 40px}
.contact .co{font-weight:800;font-size:34px;letter-spacing:.01em;margin-bottom:20px}
.contact .co em{color:#e9c987;font-style:normal}
.contact .row{display:flex;align-items:center;gap:16px;font-weight:600;font-size:33px;color:#e7ecf5;line-height:1.5;margin-top:12px}
.contact .row .ic{width:44px;flex:0 0 auto;font-size:32px}
.contact .row b{font-weight:800}
</style></head><body><div class="card"><div class="frame"></div>
<div class="stage">
  <div class="kick">BRAND<span class="dot"> ·</span> SOCIAL</div><!-- 예시 카피 — 업체별 교체 -->
  <div class="brand">브랜드<em>명</em></div>
  <div class="slogan">브랜드의 첫 인상을 만듭니다.</div><!-- 예시 슬로건 — 업체별 교체 -->
  <div class="rule"></div>
  <ul class="str">${checks}</ul>
  <div class="contact">
    <div class="co">📦 패키지 상담 <em>언제든지</em></div>
    <div class="row"><span class="ic">📍</span><span>네이버 지도 · <b>naver.me/XXXXXX</b></span></div>
    <div class="row"><span class="ic">☎️</span><span>전화 <b>00-0000-0000</b> · 휴대폰 <b>010-0000-0000</b></span></div>
    <div class="row"><span class="ic">📷</span><span>인스타 <b>@_pslab</b></span></div>
  </div>
</div></div></body></html>`;
}
