---
name: sns-자동운영-레퍼런스-생성
description: >-
  신규 업체(브랜드)에 SNS 자동운영 솔루션을 제안하기 위한 "예시 콘텐츠 레퍼런스"를 만드는 스킬.
  브랜드 웹사이트/검색으로 브랜드를 분석하고, 실제 이미지를 수집해, 인스타그램 캐러셀·네이버 블로그·
  유튜브 무드필름(힉스필드)을 브랜드 톤에 맞춰 감도 높게 제작하고, 하나의 웹 레퍼런스 페이지(Artifact)
  + 편집용 PPT로 묶어 전달한다. "신규 브랜드 레퍼런스 만들어줘", "○○ 사이트 분석해서 인스타/블로그/유튜브
  예시 콘텐츠 만들어줘", "제안용 콘텐츠 시안", "레퍼런스 페이지/PPT" 같은 요청에 사용.
  (참고 구현: 청담 먼데이투선데이=웜 럭셔리, AWK 에어워크주니어=밝은 스포티)
---

# SNS 자동운영 레퍼런스 생성

신규 업체에 SNS 자동운영을 제안할 때 쓰는 **예시 콘텐츠 세트**를 만든다. 결과물은 두 가지:
1. **웹 레퍼런스 페이지**(claude.ai Artifact) — 브랜드 분석 + 3채널 예시 콘텐츠를 한 장에.
2. **편집용 PPT**(Pretendard 임베딩) — 고객이 직접 수정 가능.

> 핵심 원칙: **브랜드마다 톤을 완전히 다시 디자인한다.** 같은 파이프라인이지만 럭셔리 다이닝과
> 주니어 패션은 색·폰트·BGM·서사가 전부 달라야 한다. 스크립트는 "출발점"이지 복붙 대상이 아니다.

---

## 0. 산출물 구성 (레퍼런스 페이지 = PPT 목차)

1. **브랜드 분석** — 업종·운영사·슬로건·가격대·톤앤무드·타겟·시그니처
2. **콘텐츠 전략** — 채널별 역할 (인스타=발견/저장, 블로그=검색유입/전환, 유튜브=무드각인)
3. **인스타그램** — 캐러셀 게시물 (기본 1건, 요청 시 2건: 브랜딩 룩북형 + 시즌 저장각형) + 캡션
4. **네이버 블로그** — SEO 롱폼 방문기/추천글 + 실제 이미지
5. **유튜브** — 실제 이미지를 힉스필드로 시네마틱 영상화한 세로형 무드필름 + 제목/설명/태그

---

## 1. 환경 제약 (반드시 숙지 — 안 지키면 막힘)

- **개발환경은 외부 이미지/영상 호스트가 프록시에서 전부 차단(403/000)**. 브랜드 사이트 이미지,
  Higgsfield cloudfront mp4 등은 **직접 다운로드 불가**. → **GitHub Actions 러너(인터넷 개방)에서
  받아 저장소로 커밋**한 뒤 pull 한다. (`collect-assets.workflow.yml`, `assemble-video.workflow.yml`)
- **WebFetch/curl 로 브랜드 사이트가 403** 나면: (a) CI 스크레이퍼로 HTML+이미지 수집,
  (b) 브랜드 정보는 **WebSearch + 네이버검색 MCP**(`NaverSearch-search_blog/search_local`)로 보강.
- **LibreOffice는 이 환경에서 동작 안 함** → PPT를 실제로 못 연다. `pptx_preview.py`(pptx→SVG 자체
  렌더러)로 레이아웃/이미지 배치를 검증한다. 텍스트 자동 줄바꿈은 실제 PowerPoint가 처리(word_wrap).
- **로컬 ffmpeg 없음** → `pip install imageio-ffmpeg` 로 풀 ffmpeg 확보(프레임 추출·웹압축·오디오 믹스).
  단, 브랜드 clip mp4 다운로드+합성은 cloudfront 차단 때문에 **CI에서** 한다.
- **numpy/fonttools/python-pptx** 는 필요 시 `pip install`. (Date.now/random 관련 이슈 없음)
- 워크플로는 **작업 브랜치에 `on: push`(paths 필터)** 로 만들면 기본 브랜치 제약 없이 자동 실행된다.
  `data/`는 gitignore이므로 트리거 파일은 `git add -f`.

---

## 2. 파이프라인 (6단계)

### ① 브랜드 분석
- 사이트 URL을 WebFetch(403이면 CI 스크레이퍼), 브랜드명으로 WebSearch/네이버검색.
- 정리: 업종, 운영사, 공식 슬로건/메타디스크립션(원문), 가격대, 타겟, 시그니처 아이템,
  **톤앤무드**(색·분위기·서사 키워드). 이걸로 디자인 방향과 콘텐츠 서사를 결정한다.
- **서사 훅(narrative hook)을 하나 잡는다.** 브랜드 성격에서 뽑아낸다:
  - 청담 먼데이투선데이 → "하루의 모든 순간"(브런치→밤 와인)
  - AWK 에어워크주니어 → "가장 활발한 나이의 여름"(아이의 액티브한 하루/여름방학)

### ② 실제 이미지 수집 (CI)
- `collect-assets.workflow.yml`(브랜드 사이트 스크레이퍼: HTML+이미지 다운로드→커밋)을 작업 브랜치에
  올리고, 트리거 파일 push → 러너가 `assets/<brand>/` 에 이미지, `docs/<brand>-src/pages.html` 저장.
- pull 후 **대표 이미지 컨택트시트**(PIL로 그리드 PNG)를 만들어 **눈으로 확인**하고, 라이프스타일/모델컷
  위주로 강한 컷을 고른다. (제품 플랫컷보다 인물/현장 컷이 캐러셀·영상에 강함)
- 사이트가 없는 오프라인 업체면(예: 식당) 다이닝코드/네이버 이미지 URL을 모아 같은 방식으로 CI 다운로드.

### ③ 인스타그램 캐러셀 (감도 높게)
- 원본 정사각(≈750~1080) 이미지를 4:5(1080×1350)로 준비(PIL cover-crop, `pop`으로 살짝 채도↑).
- 두 가지 검증된 포맷(브랜드 톤에 맞춰 택1 또는 둘 다):
  - **룩북형**(`build_ig_lookbook.py`): 상단 정사각 이미지 + 하단 텍스트 밴드. 에디토리얼/브랜딩용.
  - **포스터/저장각형**(`build_ig_poster.py`): 풀블리드 이미지 + 스티커 넘버(01·02…) + "저장각🔖" +
    체크리스트 마감. **시의성/정보성**(예: 여름방학 필수템 TOP5)에 강함. 저장·공유 유도.
- 각 카드는 HTML+Pretendard(base64 인라인)를 Chromium `--screenshot`으로 1080×1350 렌더.
  카드 1장씩 `section:nth-of-type(i)`만 display 해서 개별 캡처.
- **⚠️ 하단 잘림 주의**: 하단 텍스트 블록은 `bottom:100px+` 여유를 두고, 팁/자막은 짧게. 렌더 후
  **각 카드 하단 200px를 크롭해 잘림 없는지 반드시 확인**(과거 tip이 카드 밖으로 넘쳐 잘린 사례).
- 캡션: 브랜드 목소리로. 첫 줄 후킹 + 핵심 + CTA + 해시태그(브랜드·시즌·타겟 키워드).

### ④ 네이버 블로그
- **검색 의도**에 맞춘 SEO 롱폼 제목(예: "초등학생 여름 옷 추천 | …"). 소제목 구조 + 실제 이미지 배치
  + 방문/구매 정보 박스 + 태그. 레퍼런스 페이지 안에 네이버 블로그 UI 스타일로 렌더.

### ⑤ 유튜브 무드필름 (힉스필드)
- 라이프스타일 컷 4개를 **공개 raw GitHub URL**로 `media_import_url` → `generate_video`
  (`kling3_0_turbo`, 9:16, 1080p, 5s, ≈10크레딧/개). 프롬프트는 **잔잔한 패션/무드 b-roll**
  (천·머리카락·가벼운 카메라 무빙; 인물 변형 금지). `job_display`로 cloudfront URL 확보.
- 오버레이(`build_video_overlays.py`): 인트로/아웃트로(불투명) + 클립별 자막(투명 PNG, 1080×1920).
- **BGM은 직접 작곡(numpy)** — 저작권 100% 자유. 브랜드 톤에 맞춰 택1:
  - `generate_bgm_lounge.py` — 우아한 재즈 라운지 피아노(럭셔리/다이닝).
  - `generate_bgm_pop.py` — 밝은 여름 팝, 포온플로어 킥+플럭(주니어/액티브).
  - 스펙트로그램/RMS로 클리핑·구조 확인(들을 수 없으므로).
- **합성은 CI**(`assemble-video.workflow.yml` + `assemble-video.sh`): 클립 다운로드 → 정규화
  1080×1920@30 + 자막 오버레이 + 페이드 → concat → BGM 믹스(`assets/<brand>-video/bgm.m4a` 우선).
  결과 mp4 커밋. pull 후 `imageio-ffmpeg`로 프레임 추출해 검증, 웹용(608×1080) 재압축해 페이지에 임베드.

### ⑥ 레퍼런스 페이지 + PPT
- **레퍼런스 페이지**(`build_reference.py`): 모든 이미지/카드/웹영상을 **base64 인라인**(Artifact는 외부
  호스트 CSP 차단). Pretendard는 **사용 글리프만 서브셋→woff2**(용량 최소화). Artifact로 발행.
  영상은 웹압축본(≈1~1.5MB)만 인라인, 원본 mp4는 별도 파일로 전달.
- **편집용 PPT**(`build_pptx.py` → 폰트 임베딩): 16:9, python-pptx. 실제 이미지·완성 카드 삽입,
  모든 텍스트는 편집 가능한 텍스트박스. 저장 후 **Pretendard(Regular+Bold) fntdata 임베딩**
  (어느 PC에서도 안 깨짐 — §PPT 폰트 임베딩 참고). `pptx_preview.py`로 레이아웃 검증.
- 전달: Artifact 링크 + `SendUserFile`(카드 PNG·영상 mp4·PPT) + 저장소 raw 다운로드 링크(공개 repo).

---

## 3. PPT 폰트 임베딩 (맥/구글에서 안 깨지게)

python-pptx는 폰트 임베딩을 지원 안 하므로 직접 주입한다(검증됨):
1. OTF→TTF 변환(`pip install otf2ttf`; PowerPoint 임베딩은 TrueType이 안전).
2. pptx(zip)에 `ppt/fonts/font{1,2}.fntdata`(Regular/Bold 원바이트) 추가.
3. `[Content_Types].xml` 에 `<Default Extension="fntdata" ContentType="application/x-fontdata"/>`.
4. `ppt/_rels/presentation.xml.rels` 에 font relationship(rId) 추가.
5. `ppt/presentation.xml` 루트에 `embedTrueTypeFonts="1" saveSubsetFonts="0"`, 그리고
   **`<p:embeddedFontLst>`(typeface + regular/bold rId)를 `notesSz` 바로 뒤**(스키마 순서)에 삽입.
- 폰트 fsType=0(임베딩 허용) 확인. Pretendard OK. (구현: `build_pptx.py` 하단 임베딩 블록)
- 참고: 구글 슬라이드/키노트는 임베딩 폰트를 무시할 수 있음(대체 폰트로 표시, 깨지진 않음).

---

## 4. 디자인 방향 (브랜드별로 반드시 새로)

| | 럭셔리/다이닝 (예: 청담 먼투썬) | 영·액티브 (예: AWK 주니어) |
|---|---|---|
| 배경 | 다크(#06070B) | 화이트 |
| 폰트 | 세리프 믹스, 우아 | 볼드 산세리프, 스포티 |
| 포인트색 | 앰버/골드 | 코발트 블루 + 코랄 |
| 캐러셀 | 풀블리드 다크 + 그라데이션 | 이미지+밴드 / 포스터+스티커 |
| BGM | 재즈 라운지 피아노 | 밝은 여름 팝 |
| 서사 | 하루의 흐름/시간 | 아이의 활동/시즌 |

**하지 말 것**: 이전 브랜드 팔레트·서사를 그대로 재사용. 반드시 브랜드 분석에서 새로 도출.

---

## 5. 번들 스크립트 (scripts/)

- `collect-assets.workflow.yml` — 브랜드 사이트 HTML+이미지 CI 스크레이퍼(도메인·경로만 교체).
- `build_ig_lookbook.py` / `build_ig_poster.py` — 인스타 캐러셀 2포맷.
- `build_video_overlays.py` — 무드필름 인트로/아웃트로/자막 오버레이.
- `generate_bgm_lounge.py` / `generate_bgm_pop.py` — 저작권 free BGM(numpy) 2종.
- `assemble-video.workflow.yml` + `assemble-video.sh` — CI ffmpeg 무드필름 합성.
- `build_reference.py` — 자기완결형 레퍼런스 페이지(폰트 서브셋 + base64 인라인).
- `build_pptx.py` + `pptx_preview.py` — 편집용 PPT(폰트 임베딩) + 검증 렌더러.

경로/브랜드명/콘텐츠/색상은 각 스크립트 상단 상수와 데이터 블록에서 교체한다. 스크립트는 참고
구현(AWK/청담 기준)이므로, 새 브랜드에선 **분석 결과에 맞게 색·서사·문구·이미지 선택을 새로** 짠다.

---

## 6. 정직성·주의

- 이미지는 **브랜드 공개 자료**를 사용하고, 영상은 그 이미지를 AI(힉스필드)로 무빙 처리한 것임을
  레퍼런스에 명시("예시 레퍼런스 · 실제 집행 시 원본 고해상도로 교체 권장").
- 실존 인물(특히 아동 모델)은 브랜드 공식 카탈로그 컷에 한해 **잔잔한 무빙**만. 변형·합성 프롬프트 금지.
- 소리를 들을 수 없으므로 BGM은 스펙트로그램으로, PPT/영상은 프레임 렌더로 **눈으로 검증**한다.
