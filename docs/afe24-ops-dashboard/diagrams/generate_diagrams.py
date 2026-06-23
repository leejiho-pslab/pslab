#!/usr/bin/env python3
"""
afe24-ops-status 운영현황 대시보드 — 설계도면(아키텍처 다이어그램) 생성기

손으로 작성한 SVG를 cairosvg로 PNG 렌더링한다.
한글 렌더링을 위해 Noto Sans CJK KR 폰트를 사용한다.

생성 도면:
  1. 01_system_architecture.png   전체 시스템 아키텍처(데이터 소스 → 스킬 수집 → 저장 → API → React)
  2. 02_dashboards_map.png        4대 대시보드 구성 및 핵심 지표
  3. 03_skill_pipeline.png        cafe24-ops-status 스킬 구조 & 자동화 파이프라인
  4. 04_roadmap.png               단계별 구축 로드맵(Phase 1~4)
"""
import os
import html
import cairosvg

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "Noto Sans CJK KR, Noto Sans CJK SC, sans-serif"

# ---- palette -----------------------------------------------------------
INK      = "#1f2937"
SUBINK   = "#5b6472"
BANDBG   = "#f8fafc"
BANDLINE = "#e2e8f0"

PALETTE = {
    "c24":   dict(fill="#e8f0fe", stroke="#3b82f6", head="#3b82f6"),  # 카페24
    "ads":   dict(fill="#fff3e0", stroke="#f59e0b", head="#f59e0b"),  # 광고
    "hist":  dict(fill="#f3e8ff", stroke="#8b5cf6", head="#8b5cf6"),  # 광고 히스토리
    "comp":  dict(fill="#ffe4e6", stroke="#f43f5e", head="#f43f5e"),  # 경쟁사
    "skill": dict(fill="#dcfce7", stroke="#22c55e", head="#16a34a"),  # 스킬/수집
    "store": dict(fill="#eef2f7", stroke="#64748b", head="#475569"),  # 저장
    "api":   dict(fill="#e0e7ff", stroke="#6366f1", head="#4f46e5"),  # API
    "neutral": dict(fill="#ffffff", stroke="#94a3b8", head="#64748b"),
}


def esc(s):
    return html.escape(str(s), quote=True)


class SVG:
    def __init__(self, w, h, bg="#ffffff"):
        self.w, self.h = w, h
        self.parts = []
        self.defs = []
        self.parts.append(f'<rect x="0" y="0" width="{w}" height="{h}" fill="{bg}"/>')

    def raw(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=16, fill=INK, weight="normal", anchor="start", italic=False):
        st = "italic" if italic else "normal"
        self.parts.append(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'fill="{fill}" font-weight="{weight}" font-style="{st}" text-anchor="{anchor}">{esc(s)}</text>'
        )

    def lines(self, x, y, items, size=14, fill=INK, lh=22, anchor="start", weight="normal"):
        for i, it in enumerate(items):
            self.text(x, y + i * lh, it, size=size, fill=fill, anchor=anchor, weight=weight)

    def band(self, x, y, w, h, label=None, sub=None, color=SUBINK):
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" '
            f'fill="{BANDBG}" stroke="{BANDLINE}" stroke-width="1.5"/>'
        )
        if label:
            self.text(x + 18, y + 30, label, size=18, fill=color, weight="bold")
        if sub:
            self.text(x + 18, y + 52, sub, size=12.5, fill=SUBINK)

    def card(self, x, y, w, h, key, title, body=None, title_size=15, body_size=12.5, rx=12):
        p = PALETTE[key]
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" '
            f'fill="{p["fill"]}" stroke="{p["stroke"]}" stroke-width="1.8"/>'
        )
        # header strip
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="30" rx="{rx}" '
            f'fill="{p["head"]}"/>'
        )
        self.parts.append(
            f'<rect x="{x}" y="{y+15}" width="{w}" height="15" fill="{p["head"]}"/>'
        )
        self.text(x + 14, y + 20, title, size=title_size, fill="#ffffff", weight="bold")
        if body:
            self.lines(x + 14, y + 50, body, size=body_size, fill=INK, lh=19)
        return (x, y, w, h)

    def chip(self, x, y, w, key, label, h=26):
        p = PALETTE[key]
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="13" '
            f'fill="{p["fill"]}" stroke="{p["stroke"]}" stroke-width="1.4"/>'
        )
        self.text(x + w / 2, y + h / 2 + 4.5, label, size=12.5, fill=p["head"],
                  weight="bold", anchor="middle")

    def arrow(self, x1, y1, x2, y2, color="#94a3b8", width=2.2, dash=False):
        d = ' stroke-dasharray="6 5"' if dash else ""
        self.parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" '
            f'stroke-width="{width}"{d} marker-end="url(#arr)"/>'
        )

    def vflow(self, cx, y1, y2, color="#94a3b8"):
        self.arrow(cx, y1, cx, y2, color=color, width=2.6)

    def kpi(self, x, y, w, h, key, label, value):
        p = PALETTE[key]
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" '
                          f'fill="#ffffff" stroke="{p["stroke"]}" stroke-width="1.6"/>')
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="5" rx="2.5" fill="{p["head"]}"/>')
        self.text(x + 14, y + 28, label, size=12.5, fill=SUBINK)
        self.text(x + 14, y + 56, value, size=20, fill=INK, weight="bold")

    def table(self, x, y, w, headers, rows, col_ratios=None, row_h=27,
              head_fill="#475569", zebra="#f1f5f9", font=11.5):
        n = len(headers)
        ratios = col_ratios or [1] * n
        tot = sum(ratios)
        widths = [w * r / tot for r in ratios]
        xs = [x]
        for cw in widths:
            xs.append(xs[-1] + cw)
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{row_h}" rx="6" fill="{head_fill}"/>')
        for i, htxt in enumerate(headers):
            anchor = "start" if i == 0 else "middle"
            tx = xs[i] + 12 if i == 0 else (xs[i] + xs[i + 1]) / 2
            self.text(tx, y + row_h / 2 + 4.5, htxt, size=font + 0.5, fill="#ffffff",
                      weight="bold", anchor=anchor)
        for r, row in enumerate(rows):
            ry = y + row_h * (r + 1)
            if r % 2 == 1:
                self.parts.append(f'<rect x="{x}" y="{ry}" width="{w}" height="{row_h}" fill="{zebra}"/>')
            for i, cell in enumerate(row):
                anchor = "start" if i == 0 else "middle"
                tx = xs[i] + 12 if i == 0 else (xs[i] + xs[i + 1]) / 2
                val, color = (cell if isinstance(cell, tuple) else (cell, INK))
                weight = "bold" if i == 0 else "normal"
                self.text(tx, ry + row_h / 2 + 4.5, val, size=font, fill=color,
                          weight=weight, anchor=anchor)
        th = row_h * (len(rows) + 1)
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{th}" rx="6" '
                          f'fill="none" stroke="{BANDLINE}" stroke-width="1.2"/>')
        return th

    def render(self, name):
        marker = (
            '<defs><marker id="arr" markerWidth="11" markerHeight="11" refX="8" refY="5" '
            'orient="auto" markerUnits="userSpaceOnUse">'
            '<path d="M0,1 L9,5 L0,9 z" fill="#94a3b8"/></marker></defs>'
        )
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
            f'viewBox="0 0 {self.w} {self.h}">{marker}' + "".join(self.parts) + "</svg>"
        )
        svg_path = os.path.join(OUT, name + ".svg")
        png_path = os.path.join(OUT, name + ".png")
        with open(svg_path, "w") as f:
            f.write(svg)
        cairosvg.svg2png(bytestring=svg.encode(), write_to=png_path, scale=2)
        print("rendered", png_path)


def header(s, title, subtitle):
    s.parts.append(f'<rect x="0" y="0" width="{s.w}" height="78" fill="#0f172a"/>')
    s.text(40, 38, title, size=26, fill="#ffffff", weight="bold")
    s.text(40, 64, subtitle, size=14, fill="#9fb0c5")
    s.text(s.w - 40, 44, "afe24-ops-status", size=14, fill="#64748b", anchor="end", weight="bold")


# =======================================================================
# 1. 전체 시스템 아키텍처
# =======================================================================
def diagram_system():
    W, H = 1680, 1180
    s = SVG(W, H, bg="#ffffff")
    header(s, "전체 시스템 아키텍처",
           "자사몰 통합 자동화 대시보드 · 데이터 소스 → Claude Code 스킬(수집/정규화) → 저장 → API → React 대시보드")
    L, R = 40, W - 40
    cx = W / 2

    # ---- Band A: 데이터 소스 -------------------------------------------
    ay = 100
    s.band(L, ay, R - L, 150, "① 데이터 소스 (External Sources)",
           "외부에서 받아오는 원천 데이터 — API 우선, 비공개 영역은 크롤링/검색으로 보완")
    cw = (R - L - 18 * 4) / 3
    s.card(L + 18, ay + 64, cw, 72, "c24", "카페24 Admin API",
           ["주문 · 매출 · 방문 · 전환", "상품 · 재고 · 회원 · 쿠폰"])
    s.card(L + 18 + (cw + 18), ay + 64, cw, 72, "ads", "광고 플랫폼 API",
           ["Meta · Google Ads", "Naver GFA/SA · Kakao Moment"])
    s.card(L + 18 + (cw + 18) * 2, ay + 64, cw, 72, "comp", "경쟁사 모니터링 소스",
           ["경쟁사몰 · 네이버쇼핑 · SNS", "(공개 데이터 크롤링/검색 수집)"])

    # ---- Band B: 수집/정규화 (스킬) ------------------------------------
    by = 290
    s.band(L, by, R - L, 230, "② 수집 · 정규화 계층  —  Claude Code 스킬 (Python)",
           "cafe24-ops-status.skill : 소스별 collector + 스케줄러 + ETL(정규화·중복제거·집계)")
    # collectors
    c4w = (R - L - 18 * 5) / 4
    collectors = [
        ("c24",  "cafe24_collector", ["주문/매출/방문", "상품/재고/회원"]),
        ("ads",  "ads_collector", ["채널별 광고비/노출", "클릭/전환/ROAS"]),
        ("hist", "creative_collector", ["DA 소재별 성과", "소재 메타/썸네일"]),
        ("comp", "competitor_collector", ["프로모션/광고/베스트", "후기 변화 추적"]),
    ]
    for i, (k, t, b) in enumerate(collectors):
        s.card(L + 18 + i * (c4w + 18), by + 70, c4w, 78, k, t, b, title_size=13.5)
    # etl + scheduler row
    s.card(L + 18, by + 162, (R - L - 18 * 3) / 2, 52, "skill",
           "ETL · 정규화 엔진", ["단위/통화/기간 표준화 · 중복제거 · 일/주/월 집계"], title_size=13.5)
    s.card(L + 18 + (R - L - 18 * 3) / 2 + 18, by + 162, (R - L - 18 * 3) / 2, 52, "skill",
           "스케줄러 (cron · GitHub Actions)",
           ["매일 1회(데일리) 전일자 데이터 자동 수집 — 100% 무인"], title_size=13.5)

    # ---- Band C: 데이터 저장 -------------------------------------------
    cy = 560
    s.band(L, cy, R - L, 130, "③ 데이터 저장 (Data Store)", None)
    sw = (R - L - 18 * 4) / 3
    s.card(L + 18, cy + 44, sw, 70, "store", "원천 Raw 저장",
           ["JSON / Parquet 스냅샷", "재처리·감사용 이력 보관"])
    s.card(L + 18 + (sw + 18), cy + 44, sw, 70, "store", "정규화 DB",
           ["SQLite → Postgres", "표준 스키마(주문/광고/소재/경쟁사)"])
    s.card(L + 18 + (sw + 18) * 2, cy + 44, sw, 70, "store", "지표 캐시(집계)",
           ["KPI 사전 집계 테이블", "대시보드 빠른 응답용"])

    # ---- Band D: 서비스 API --------------------------------------------
    dy = 730
    s.band(L, dy, R - L, 120, "④ 서비스 API (Backend)", None)
    s.card(L + 18, dy + 44, R - L - 36, 62, "api", "FastAPI (Python)",
           ["REST 엔드포인트(대시보드별 지표 제공) · 인증/권한 · 캐시 · 알림(Webhook/Slack) 연동"])

    # ---- Band E: 프론트엔드 --------------------------------------------
    ey = 890
    s.band(L, ey, R - L, 250, "⑤ 프론트엔드 — React 웹 대시보드", None)
    dw = (R - L - 18 * 5) / 4
    dboards = [
        ("c24",  "카페24 어드민\n대시보드", ["매출·주문·전환·객단가", "방문/재방문·카테고리", "디바이스·베스트·CRM"]),
        ("ads",  "광고 대시보드", ["ROAS·광고비·기여", "채널별 성과", "자사몰 현황과 결합"]),
        ("hist", "광고 히스토리\n대시보드", ["DA 소재별 데이터", "Top 소재 자동 선별", "성과 추세 비교"]),
        ("comp", "경쟁사 모니터링\n대시보드", ["프로모션·광고", "베스트·후기 추적", "벤치마킹 인사이트"]),
    ]
    for i, (k, t, b) in enumerate(dboards):
        x = L + 18 + i * (dw + 18)
        title = t.replace("\n", " ")
        s.card(x, ey + 60, dw, 150, k, title, None, title_size=13.5)
        s.lines(x + 14, ey + 100, b, size=12.5, lh=24)
        s.chip(x + 14, ey + 174, dw - 28, "skill", "100% 자동화")

    # ---- vertical flow arrows ------------------------------------------
    for (y1, y2) in [(250, 290), (520, 560), (690, 730), (850, 890)]:
        s.vflow(cx, y1, y2)

    # side note
    s.text(R, 268, "▲ 데이터는 아래에서 위로 흐름", size=12, fill=SUBINK, anchor="end")
    s.render("01_system_architecture")


# =======================================================================
# 2. 4대 대시보드 구성도
# =======================================================================
def diagram_dashboards():
    W, H = 1680, 1080
    s = SVG(W, H, bg="#ffffff")
    header(s, "4대 대시보드 구성 & 핵심 지표",
           "각 대시보드의 목적 · 핵심 지표 · 자동화로 답하는 질문")
    L, R = 40, W - 40
    colw = (R - L - 18) / 2
    rowh = 440
    top = 110

    blocks = [
        ("c24", "카페24 어드민 대시보드",
         "기존 keek 운영 대시보드와 동일 지표 · 데일리 수집 (상세: 도면 05)",
         [("핵심 지표", ["매출·주문·객단가·전환율", "방문/재방문·회원가입", "디바이스·카테고리 매출", "베스트상품·CRM·재고"]),
          ("자동으로 답하는 질문", ["오늘/이번주 매출은?", "어떤 상품이 잘 팔리나?", "어디서 이탈이 나나?"])]),
        ("ads", "광고 대시보드",
         "자사몰 현황과 광고 현황을 함께 분석",
         [("핵심 지표", ["총 광고비·매출 기여·ROAS", "채널별(메타/구글/네이버/카카오)", "CPC·CPA·CTR·전환수", "광고/비광고 매출 비중"]),
          ("자동으로 답하는 질문", ["광고비 대비 수익은?", "어느 채널이 효율적인가?", "예산 재배분 포인트는?"])]),
        ("hist", "광고 히스토리 대시보드",
         "DA 채널 소재별 데이터로 성과 좋은 소재를 한번에 선별",
         [("핵심 지표", ["소재별 노출/클릭/전환", "소재 ROAS·CTR 랭킹", "썸네일·카피·기간 메타", "피로도(성과 하락) 신호"]),
          ("자동으로 답하는 질문", ["가장 잘 먹힌 소재는?", "교체해야 할 소재는?", "다음 소재 방향은?"])]),
        ("comp", "경쟁사 모니터링 대시보드",
         "핵심 경쟁사의 시장 활동을 추적해 벤치마킹",
         [("핵심 지표", ["프로모션/할인 변화", "노출 광고·소재", "베스트 상품 순위", "신규 후기·평점 추이"]),
          ("자동으로 답하는 질문", ["경쟁사 지금 뭘 미나?", "벤치마킹할 소재는?", "시장 트렌드 변화는?"])]),
    ]
    for idx, (k, title, purpose, sections) in enumerate(blocks):
        r, c = divmod(idx, 2)
        x = L + c * (colw + 18)
        y = top + r * (rowh + 16)
        p = PALETTE[k]
        s.parts.append(f'<rect x="{x}" y="{y}" width="{colw}" height="{rowh}" rx="16" '
                       f'fill="#ffffff" stroke="{p["stroke"]}" stroke-width="2"/>')
        s.parts.append(f'<rect x="{x}" y="{y}" width="{colw}" height="46" rx="16" fill="{p["head"]}"/>')
        s.parts.append(f'<rect x="{x}" y="{y+26}" width="{colw}" height="20" fill="{p["head"]}"/>')
        s.text(x + 20, y + 30, title, size=19, fill="#ffffff", weight="bold")
        s.chip(x + colw - 132, y + 9, 116, "skill", "100% 자동화")
        s.text(x + 20, y + 74, purpose, size=13, fill=SUBINK)
        # sections
        sy = y + 96
        sub_w = (colw - 60) / 2
        for j, (stitle, items) in enumerate(sections):
            sx = x + 20 + j * (sub_w + 20)
            s.parts.append(f'<rect x="{sx}" y="{sy}" width="{sub_w}" height="300" rx="10" '
                           f'fill="{p["fill"]}" stroke="{p["stroke"]}" stroke-width="1" opacity="0.95"/>')
            s.text(sx + 14, sy + 28, stitle, size=14, fill=p["head"], weight="bold")
            s.lines(sx + 16, sy + 58, ["• " + it for it in items], size=12.8, lh=26)

    s.render("02_dashboards_map")


# =======================================================================
# 3. 스킬 구조 & 자동화 파이프라인
# =======================================================================
def diagram_skill():
    W, H = 1680, 1080
    s = SVG(W, H, bg="#ffffff")
    header(s, "cafe24-ops-status 스킬 구조 & 자동화 파이프라인",
           "Claude Code 스킬(Python)로 패키징되는 수집 모듈과 무인 실행 파이프라인")
    L, R = 40, W - 40

    # ---- left: folder tree --------------------------------------------
    tx, ty, tw, th = L, 110, 720, 560
    s.band(tx, ty, tw, th, "스킬 폴더 구조", "cafe24-ops-status.skill/")
    tree = [
        ("SKILL.md", "스킬 정의 · 사용법 · 트리거", 0, "skill"),
        ("config/", "", 0, None),
        ("sources.yaml", "쇼핑몰·광고계정·경쟁사 목록", 1, "store"),
        ("metrics.yaml", "대시보드 지표 정의(수정 자유)", 1, "c24"),
        ("secrets.env", "API 키/토큰 (gitignore)", 1, "store"),
        ("collectors/", "", 0, None),
        ("cafe24_collector.py", "Admin API 수집", 1, "c24"),
        ("ads_collector.py", "광고 플랫폼 API 수집", 1, "ads"),
        ("creative_collector.py", "DA 소재별 성과 수집", 1, "hist"),
        ("competitor_collector.py", "경쟁사 공개정보 수집", 1, "comp"),
        ("etl/", "", 0, None),
        ("normalize.py", "표준화·중복제거", 1, "skill"),
        ("aggregate.py", "KPI 집계(일/주/월)", 1, "skill"),
        ("store/", "raw · DB · 집계 캐시", 0, "store"),
        ("api/  (FastAPI)", "대시보드용 엔드포인트", 0, "api"),
        ("dashboard/  (React)", "4대 대시보드 UI", 0, "c24"),
        ("scripts/run_all.py", "전체 파이프라인 1회 실행", 0, "skill"),
    ]
    yy = ty + 70
    for name, desc, depth, key in tree:
        ix = tx + 24 + depth * 28
        if key:
            p = PALETTE[key]
            s.parts.append(f'<rect x="{ix}" y="{yy-15}" width="12" height="12" rx="3" '
                           f'fill="{p["fill"]}" stroke="{p["stroke"]}" stroke-width="1.4"/>')
        s.text(ix + 20, yy - 4, name, size=14,
               fill=INK, weight="bold" if depth == 0 else "normal")
        if desc:
            s.text(tx + 360, yy - 4, "— " + desc, size=12.5, fill=SUBINK)
        yy += 30

    # ---- right: pipeline ----------------------------------------------
    px, py, pw, ph = tx + tw + 20, 110, R - (tx + tw + 20), 560
    s.band(px, py, pw, ph, "자동화 파이프라인 (무인 실행)", "스케줄 트리거 → 수집 → 정규화 → 집계 → 제공")
    steps = [
        ("skill", "트리거", "cron / GitHub Actions\n매일 1회(데일리)"),
        ("c24",   "1) 수집", "소스별 collector 병렬 실행\n(카페24·광고·소재·경쟁사)"),
        ("skill", "2) 정규화", "단위/기간/통화 표준화\n중복 제거 · 매핑"),
        ("store", "3) 집계·저장", "KPI 집계 → DB/캐시 적재\nraw 스냅샷 보관"),
        ("api",   "4) 제공", "FastAPI가 지표 서빙\n→ React 대시보드 갱신"),
        ("hist",  "5) 알림(선택)", "이상치/Top소재/경쟁사 변화\nSlack·이메일 푸시"),
    ]
    bx = px + 40
    bw = pw - 80
    bh = 64
    gap = 18
    sy = py + 80
    for i, (k, t, d) in enumerate(steps):
        y = sy + i * (bh + gap)
        p = PALETTE[k]
        s.parts.append(f'<rect x="{bx}" y="{y}" width="{bw}" height="{bh}" rx="12" '
                       f'fill="{p["fill"]}" stroke="{p["stroke"]}" stroke-width="1.8"/>')
        s.parts.append(f'<rect x="{bx}" y="{y}" width="150" height="{bh}" rx="12" fill="{p["head"]}"/>')
        s.parts.append(f'<rect x="{bx+138}" y="{y}" width="12" height="{bh}" fill="{p["head"]}"/>')
        s.text(bx + 16, y + bh / 2 + 5, t, size=15, fill="#ffffff", weight="bold")
        d1, d2 = d.split("\n")
        s.text(bx + 168, y + 26, d1, size=12.8, fill=INK)
        s.text(bx + 168, y + 47, d2, size=12.8, fill=SUBINK)
        if i < len(steps) - 1:
            s.arrow(bx + bw / 2, y + bh, bx + bw / 2, y + bh + gap, color=p["stroke"])

    s.text(L, H - 28, "핵심: 모든 단계가 스케줄러로 무인 실행되어 '100% 자동화' 목표를 달성한다.",
           size=13, fill=SUBINK)
    s.render("03_skill_pipeline")


# =======================================================================
# 4. 단계별 로드맵
# =======================================================================
def diagram_roadmap():
    W, H = 1680, 820
    s = SVG(W, H, bg="#ffffff")
    header(s, "단계별 구축 로드맵",
           "스킬 골격 → 카페24 → 광고 → 소재/경쟁사 → 자동화 고도화 순으로 가치를 빠르게 검증")
    L, R = 40, W - 40

    phases = [
        ("skill", "Phase 0\n기반·골격", [
            "스킬 폴더/SKILL.md 생성",
            "config(sources/secrets) 정의",
            "저장소 스키마 · run_all 골격",
            "✦ 산출: 동작하는 빈 파이프라인",
        ]),
        ("c24", "Phase 1\n카페24 대시보드", [
            "Admin API 수집기 구현",
            "매출/주문/방문/재고 집계",
            "React 어드민 대시보드",
            "✦ 산출: 자사몰 현황 자동화",
        ]),
        ("ads", "Phase 2\n광고 대시보드", [
            "광고 플랫폼 API 연동",
            "ROAS·채널 성과 + 매출 결합",
            "광고 대시보드 화면",
            "✦ 산출: 통합 광고 분석",
        ]),
        ("hist", "Phase 3\n소재·경쟁사", [
            "DA 소재별 성과 수집/선별",
            "경쟁사 모니터링 수집기",
            "히스토리·경쟁사 대시보드",
            "✦ 산출: 인사이트 자동화",
        ]),
        ("store", "Phase 4\n자동화 고도화", [
            "스케줄러 무인 운영 안정화",
            "알림(이상치/Top/경쟁사)",
            "권한·배포·모니터링",
            "✦ 산출: 100% 무인 운영",
        ]),
    ]
    n = len(phases)
    gap = 16
    cw = (R - L - gap * (n - 1)) / n
    top = 120
    chh = 470
    # timeline
    ty = top - 24
    s.parts.append(f'<line x1="{L}" y1="{ty}" x2="{R}" y2="{ty}" stroke="{BANDLINE}" stroke-width="3"/>')
    for i, (k, title, items) in enumerate(phases):
        x = L + i * (cw + gap)
        p = PALETTE[k]
        # node on timeline
        s.parts.append(f'<circle cx="{x + cw/2}" cy="{ty}" r="8" fill="{p["head"]}"/>')
        # card
        s.parts.append(f'<rect x="{x}" y="{top}" width="{cw}" height="{chh}" rx="14" '
                       f'fill="#ffffff" stroke="{p["stroke"]}" stroke-width="2"/>')
        s.parts.append(f'<rect x="{x}" y="{top}" width="{cw}" height="64" rx="14" fill="{p["head"]}"/>')
        s.parts.append(f'<rect x="{x}" y="{top+40}" width="{cw}" height="24" fill="{p["head"]}"/>')
        t1, t2 = title.split("\n")
        s.text(x + cw / 2, top + 28, t1, size=15, fill="#ffffff", weight="bold", anchor="middle")
        s.text(x + cw / 2, top + 52, t2, size=14, fill="#ffffff", weight="bold", anchor="middle")
        yy = top + 96
        for it in items:
            highlight = it.startswith("✦")
            s.lines(x + 16, yy, [it], size=12.8,
                    fill=(p["head"] if highlight else INK),
                    weight=("bold" if highlight else "normal"), lh=20)
            # wrap-ish manual: long lines fit within card width (cards are wide enough)
            yy += 64 if highlight else 58
        if i < n - 1:
            s.arrow(x + cw + 1, top + chh / 2, x + cw + gap - 1, top + chh / 2, color="#cbd5e1")

    s.render("04_roadmap")


# =======================================================================
# 5. 카페24 어드민 대시보드 상세 (기존 keek 대시보드와 동일 지표)
# =======================================================================
def diagram_cafe24_detail():
    W, H = 1680, 1300
    s = SVG(W, H, bg="#ffffff")
    header(s, "카페24 어드민 대시보드 — 상세 설계",
           "기존 keek 운영 대시보드와 동일 지표 구성 · 데일리(매일 1회) 자동 수집 · 모든 지표는 config/metrics.yaml로 자유 수정")
    L, R = 40, W - 40
    red = "#dc2626"
    grn = "#16a34a"

    # ---- 상단 요약 KPI 카드 -------------------------------------------
    s.text(L, 104, "상단 요약 KPI", size=15, fill=SUBINK, weight="bold")
    kpis = [("매출", "₩26,723,153"), ("광고 매출액", "—"), ("주문건수", "221건"),
            ("객단가", "₩120,919"), ("구매전환율", "1.02%"), ("매출대비 광고비율", "23.72%")]
    ky = 116
    kw = (R - L - 14 * 5) / 6
    for i, (lab, val) in enumerate(kpis):
        s.kpi(L + i * (kw + 14), ky, kw, 78, "c24", lab, val)

    # ---- 핵심 지표 기간 비교 표 ----------------------------------------
    ty = 226
    s.text(L, ty - 8, "핵심 지표 기간 비교", size=15, fill=SUBINK, weight="bold")
    headers = ["지표", "최근 7일", "직전 7일", "당월 누적", "전월 동기", "전년 동기"]
    rows = [
        ["매출", "₩705,912", "₩16,379,939", "₩26,723,153", "₩16,160,042", "₩6,309,987"],
        ["수주건수", "65", "130", "221", "131", "70"],
        ["객단가", "₩118,552", "₩125,000", "₩120,919", "₩123,359", "₩90,148"],
        ["구매전환율", "1.14%", "1.04%", "1.02%", "0.55%", "0.35%"],
        ["방문자", "5,703", "12,494", "21,742", "23,951", "19,938"],
        ["광고비용", "₩935,475", "₩3,885,160", "₩6,338,937", "₩9,848,709", "₩40,010"],
        ["매출대비 광고비율", "8.55%", "23.72%", "23.72%", "54.76%", "0.63%"],
    ]
    s.table(L, ty + 6, R - L, headers, rows, col_ratios=[2.0, 1.3, 1.3, 1.3, 1.3, 1.3])

    # ---- 일별 운영 데이터 표 (구분 그룹) -------------------------------
    gy = 480
    s.text(L, gy - 8, "일별 운영 데이터 (구분 그룹별 · 일자별 컬럼으로 전개)", size=15, fill=SUBINK, weight="bold")
    groups = [
        ("매출·주문", ["매출합계", "주문수 · 객단가", "순매출 · 구매전환율", "취소 · 환불금액"]),
        ("방문자", ["전체 · 신규 · 재방문", "재방문율", "신규가입수 · 가입율"]),
        ("CRM", ["문자 · 알림톡", "카카오", "후기수"]),
        ("모바일(결제)", ["매출 · 주문건수", "객단가 · 결제비중"]),
        ("PC", ["매출 · 주문건수", "객단가 · PC비중"]),
        ("재고·장바구니", ["장바구니 · 재고수량", "입고예정 · 품절", "외부채널 비율"]),
        ("카테고리 매출", ["All · BEST · NEW", "Travel · Filovely", "Recovery · HOODIE …"]),
        ("베스트 상품 TOP", ["상품별 매출 순위", "(TOP N 자동 정렬)"]),
    ]
    gcols = 4
    gw = (R - L - 16 * (gcols - 1)) / gcols
    gh = 132
    for i, (name, items) in enumerate(groups):
        r, c = divmod(i, gcols)
        x = L + c * (gw + 16)
        y = gy + 8 + r * (gh + 14)
        s.card(x, y, gw, gh, "c24", name, items, title_size=13.5, body_size=12.5)

    # ---- 차트 5종 ------------------------------------------------------
    cy = 800
    s.text(L, cy - 8, "차트 5종", size=15, fill=SUBINK, weight="bold")
    charts = ["① 일별 매출 추이\n(누적 vs 목표)", "② 디바이스별 매출 비중\n(모바일/PC)",
              "③ 신규 vs 재구매 매출\n(일별)", "④ 일별 광고비\nvs 매출대비 광고비율",
              "⑤ 카테고리 매출\nTOP 10"]
    chtypes = ["barline", "donut", "area", "barline", "hbar"]
    cw5 = (R - L - 16 * 4) / 5
    chh = 150
    cyy = cy + 8
    for i, (title, kind) in enumerate(zip(charts, chtypes)):
        x = L + i * (cw5 + 16)
        p = PALETTE["c24"]
        s.parts.append(f'<rect x="{x}" y="{cyy}" width="{cw5}" height="{chh}" rx="10" '
                       f'fill="#ffffff" stroke="{p["stroke"]}" stroke-width="1.6"/>')
        t1, t2 = title.split("\n")
        s.text(x + 12, cyy + 24, t1, size=12.5, fill=INK, weight="bold")
        s.text(x + 12, cyy + 42, t2, size=11.5, fill=SUBINK)
        # mini glyph
        gx, gyc, gw2, gh2 = x + 20, cyy + 70, cw5 - 40, 60
        col = p["head"]
        if kind == "barline":
            bars = [0.4, 0.7, 0.3, 0.9, 0.55, 0.8]
            bw = gw2 / (len(bars) * 1.6)
            for j, hbar in enumerate(bars):
                bx = gx + j * (gw2 / len(bars))
                s.parts.append(f'<rect x="{bx}" y="{gyc + gh2 - gh2*hbar}" width="{bw}" '
                               f'height="{gh2*hbar}" fill="{col}" opacity="0.55"/>')
            pts = " ".join(f"{gx + j*(gw2/len(bars)) + bw/2},{gyc + gh2 - gh2*min(1,(0.2+0.13*j))}"
                           for j in range(len(bars)))
            s.parts.append(f'<polyline points="{pts}" fill="none" stroke="{INK}" stroke-width="2"/>')
        elif kind == "donut":
            ccx, ccy = gx + gw2 / 2, gyc + gh2 / 2
            s.parts.append(f'<circle cx="{ccx}" cy="{ccy}" r="26" fill="none" stroke="{col}" stroke-width="12"/>')
            s.parts.append(f'<circle cx="{ccx}" cy="{ccy}" r="26" fill="none" stroke="{PALETTE["ads"]["head"]}" '
                           f'stroke-width="12" stroke-dasharray="55 200" transform="rotate(-90 {ccx} {ccy})"/>')
        elif kind == "area":
            s.parts.append(f'<polygon points="{gx},{gyc+gh2} {gx},{gyc+gh2-12} '
                           f'{gx+gw2*0.3},{gyc+gh2-40} {gx+gw2*0.55},{gyc+gh2-18} '
                           f'{gx+gw2*0.8},{gyc+gh2-34} {gx+gw2},{gyc+gh2-20} {gx+gw2},{gyc+gh2}" '
                           f'fill="{col}" opacity="0.45"/>')
        elif kind == "hbar":
            vals = [0.95, 0.8, 0.66, 0.55, 0.4]
            bh3 = gh2 / (len(vals) * 1.5)
            for j, v in enumerate(vals):
                by = gyc + j * (gh2 / len(vals))
                s.parts.append(f'<rect x="{gx}" y="{by}" width="{gw2*v}" height="{bh3}" '
                               f'fill="{col}" opacity="0.6"/>')

    # ---- 하단 안내(자유도 / 데일리) -----------------------------------
    ny = cyy + chh + 26
    s.parts.append(f'<rect x="{L}" y="{ny}" width="{R-L}" height="120" rx="12" '
                   f'fill="#ecfdf5" stroke="{grn}" stroke-width="1.6"/>')
    s.text(L + 20, ny + 32, "수정 자유도 & 수집 주기", size=15, fill=grn, weight="bold")
    notes = [
        "• 카드 · 표 · 차트의 모든 지표는 config/metrics.yaml에 선언 → 추가/삭제/순서변경/이름변경이 코드 수정 없이 가능",
        "• 수집은 시간별이 아닌 데일리(매일 1회, 전일자 기준) · 집계 단위: 일/주(7일)/당월/전월/전년 동기 비교",
        "• 지표 그룹·카테고리·베스트 TOP N 개수도 설정값 → 운영하며 자유롭게 튜닝",
    ]
    s.lines(L + 20, ny + 58, notes, size=12.8, fill=INK, lh=22)

    s.render("05_cafe24_dashboard_detail")


if __name__ == "__main__":
    diagram_system()
    diagram_dashboards()
    diagram_skill()
    diagram_roadmap()
    diagram_cafe24_detail()
    print("done")
