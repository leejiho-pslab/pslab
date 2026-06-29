#!/usr/bin/env python3
"""
네이버 블로그 자동 생성 (1일 2회) — 시장조사 → 기획 → 포스팅.
설계 원칙:
  · 네이버 SEO + GEO(생성형 검색 최적화) 규칙을 시스템 프롬프트로 강제
  · "AI 느낌"을 최대한 줄임 (상투구 금지, 문장 길이 변주, 지역·경험 디테일, 1인칭)
  · 발행은 사람이 직접 (네이버는 공식 자동게시 API 부재) — 붙여넣기용 완성 원고+메타 생성

환경변수:
  ANTHROPIC_API_KEY  (필수, 없으면 dry-run 샘플 생성)
  BLOG_MODEL         (선택, 기본 claude-sonnet-4-6)
  NAVER_CLIENT_ID / NAVER_CLIENT_SECRET (선택: 실검 트렌드 보강)
  POSTS_PER_RUN      (선택, 기본 2)

사용법: python blog_generate.py <out_dir> [YYYY-MM-DD]
"""
import json
import os
import sys
import re
import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib_brand import load_brand

B = load_brand()
MODEL = os.environ.get("BLOG_MODEL", "claude-sonnet-4-6")
POSTS = int(os.environ.get("POSTS_PER_RUN", "2"))
REGION = "대전 · 세종 · 충청"

SYSTEM = f"""너는 {REGION} 지역에서 현대자동차를 파는 베테랑 카마스터 '{B['name']}'의 블로그를 대신 쓰는 사람이다.
글은 반드시 한국어. 목표: 네이버 검색 상위 노출 + 생성형 검색(AI)이 인용하기 좋은 신뢰성, 그리고 '사람이 쓴 글'처럼 읽히기.

[절대 규칙 — AI 느낌 제거]
- "오늘은 ~에 대해 알아보겠습니다", "여러분", "어떠셨나요?", "지금까지 ~였습니다" 같은 상투적 도입/마무리 금지.
- 모든 문장을 같은 길이로 쓰지 말 것. 짧은 문장과 긴 문장을 섞고, 가끔 한 단어 문장도 허용.
- 과장된 형용사 남발 금지. 구체적 숫자·지명·차종·실제 상황으로 말할 것.
- 1인칭('제가', '저는')과 현장 경험(출고, 상담, 시승) 디테일을 넣을 것.
- 이모지는 0~3개로 절제. 느낌표 남발 금지.
- 같은 단어 반복 회피, 자연스러운 구어체 섞기.

[네이버 SEO]
- 제목에 핵심 키워드 1개를 자연스럽게 포함(32자 내외).
- 소제목(##) 3~5개, 각 소제목에 연관 키워드.
- 본문 1500~2200자. 핵심 키워드는 본문에 5~8회(억지 X).
- 마지막에 지역+상담 유도(상호, 이름, 전화 {B['phone']}).
- 태그 8~12개(핵심+연관+지역).

[GEO — 생성형 검색 최적화]
- 질문형 소제목 1개 이상(예: "그랜저 법인 리스, 개인이랑 뭐가 다를까").
- 사실/수치는 단정적으로, 인용 가능하게 정리. 표 또는 번호 목록 1개 이상.
- 차종/조건/지역 등 '엔티티'를 명확히 표기.

브랜드 정보: {B['dealership']}, 카마스터 {B['name']}, 전화 {B['phone']}, 사무실 {B['office']}, 유튜브 {B['youtube_handle']}.
취급: 신차 구매, 법인 구매, 할부·리스·장기렌트, 보상판매, 출고·등록 대행, 사후관리."""


def _client():
    try:
        import anthropic
    except ImportError:
        os.system(f"{sys.executable} -m pip install -q anthropic")
        import anthropic
    return anthropic.Anthropic()


def _ask(client, prompt, max_tokens=2000, temperature=0.9):
    msg = client.messages.create(
        model=MODEL, max_tokens=max_tokens, temperature=temperature,
        system=SYSTEM, messages=[{"role": "user", "content": prompt}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()


def naver_trends():
    """선택: 네이버 검색 트렌드(있으면). 키 없으면 빈 리스트."""
    cid, cs = os.environ.get("NAVER_CLIENT_ID"), os.environ.get("NAVER_CLIENT_SECRET")
    if not (cid and cs):
        return []
    try:
        import urllib.request
        seeds = ["대전 현대자동차", "그랜저 견적", "싼타페 출고", "법인 리스", "아이오닉5 보조금"]
        body = json.dumps({
            "startDate": (datetime.date.today() - datetime.timedelta(days=30)).isoformat(),
            "endDate": datetime.date.today().isoformat(), "timeUnit": "week",
            "keywordGroups": [{"groupName": s, "keywords": [s]} for s in seeds[:5]],
        }).encode()
        req = urllib.request.Request("https://openapi.naver.com/v1/datalab/search", data=body,
            headers={"X-Naver-Client-Id": cid, "X-Naver-Client-Secret": cs, "Content-Type": "application/json"})
        data = json.loads(urllib.request.urlopen(req, timeout=15).read())
        ranked = sorted(data.get("results", []),
                        key=lambda r: (r["data"][-1]["ratio"] if r["data"] else 0), reverse=True)
        return [r["title"] for r in ranked]
    except Exception as e:
        sys.stderr.write(f"[blog] naver trends 실패(무시): {e}\n")
        return []


def research(client, n):
    trends = naver_trends()
    hint = f"\n참고: 최근 검색 상승 키워드 = {', '.join(trends)}" if trends else ""
    prompt = (f"{REGION} 현대자동차 구매 고객이 지금 시기에 검색할 법한 블로그 주제 {n}개를 기획해줘.{hint}\n"
              f"계절성·신차·보조금·법인/리스 등 실제 검색 수요를 반영. 각 주제마다 JSON 한 줄로:\n"
              '{"title":"제목","keyword":"핵심키워드","angle":"이 글만의 관점/후킹","intent":"검색의도"}\n'
              f"코드블록 없이 {n}줄만 출력.")
    raw = _ask(client, prompt, max_tokens=900, temperature=1.0)
    out = []
    for line in raw.splitlines():
        line = line.strip().strip("`").lstrip("0123456789.- )")
        if line.startswith("{"):
            try:
                out.append(json.loads(line))
            except Exception:
                pass
    return out[:n]


def write_post(client, topic):
    prompt = (f"아래 주제로 네이버 블로그 글 하나를 완성해줘.\n"
              f"제목: {topic['title']}\n핵심키워드: {topic['keyword']}\n관점: {topic.get('angle','')}\n"
              f"검색의도: {topic.get('intent','')}\n\n"
              f"출력 형식(반드시 이 순서, 마크다운):\n"
              f"1) 한 줄 제목(# 제목)\n2) 본문(소제목 ##, 목록/표 포함, 1500~2200자)\n"
              f"3) 마지막 줄에 `---META---` 후 JSON: "
              '{"description":"검색 설명 70자내","tags":["..."],"image_prompts":["대표이미지 묘사 2개"]}')
    return _ask(client, prompt, max_tokens=3000, temperature=0.92)


def split_meta(text):
    if "---META---" in text:
        body, meta = text.split("---META---", 1)
        m = re.search(r"\{.*\}", meta, re.S)
        try:
            return body.strip(), json.loads(m.group(0)) if m else {}
        except Exception:
            return body.strip(), {}
    return text.strip(), {}


def sample_post(topic, idx):
    """dry-run(키 없음) 샘플 — 파이프라인 검증용."""
    body = f"""# {topic['title']}

요즘 {REGION}에서 {topic['keyword']} 문의가 부쩍 늘었습니다. 상담을 하다 보면 같은 질문이 반복돼요. 그래서 정리합니다.

## {topic['keyword']}, 핵심부터
제가 현장에서 가장 많이 받는 질문 세 가지입니다.
1. 지금 사는 게 맞나
2. 할부와 리스 중 무엇이 유리한가
3. 출고까지 얼마나 걸리나

## {topic.get('angle','실제 사례')}
지난주에도 비슷한 상담이 있었습니다. 예산과 용도를 먼저 듣고, 무리한 옵션은 덜어냈습니다.

## 상담 안내
{B['dealership']} 카마스터 {B['name']}입니다. 견적·시승·출고 문의는 {B['phone']}.

---META---
{{"description":"{topic['keyword']} {REGION} 구매 가이드 — 카마스터 실전 정리","tags":["{topic['keyword']}","대전현대자동차","{B['name']}카마스터","현대차견적","법인리스","신차출고"],"image_prompts":["{topic['keyword']} 관련 현대차 정면","상담 장면"]}}
"""
    return body


def main():
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("output/blog")
    date = sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().isoformat()
    day_dir = out_dir / date
    day_dir.mkdir(parents=True, exist_ok=True)

    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    if has_key:
        client = _client()
        topics = research(client, POSTS)
    else:
        sys.stderr.write("[blog] ANTHROPIC_API_KEY 없음 → dry-run 샘플 생성\n")
        client, topics = None, [
            {"title": "대전 그랜저 견적, 지금 사도 될까", "keyword": "대전 그랜저 견적", "angle": "연식변경 직전 타이밍", "intent": "구매시점"},
            {"title": "법인 리스 vs 장기렌트, 사장님께 뭐가 이득일까", "keyword": "법인 리스", "angle": "세금·비용 비교", "intent": "비용비교"},
        ][:POSTS]

    index = []
    for i, topic in enumerate(topics, 1):
        text = write_post(client, topic) if has_key else sample_post(topic, i)
        body, meta = split_meta(text)
        slug = re.sub(r"[^0-9A-Za-z가-힣]+", "-", topic["title"]).strip("-")[:40]
        md = day_dir / f"{i:02d}_{slug}.md"
        md.write_text(body + "\n", encoding="utf-8")
        (day_dir / f"{i:02d}_{slug}.meta.json").write_text(
            json.dumps({**topic, **meta}, ensure_ascii=False, indent=2), encoding="utf-8")
        index.append({"file": md.name, "title": topic["title"], "keyword": topic["keyword"], "meta": meta})
        print(f"[blog] {i}/{len(topics)} → {md.name}")

    (day_dir / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[blog] {len(index)}편 생성 완료 → {day_dir}  (발행은 직접: 네이버 글쓰기에 붙여넣기)")


if __name__ == "__main__":
    main()
