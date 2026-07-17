# SNS 자동운영 레퍼런스 생성 — 스킬 패키지

> 신규 업체(브랜드)에 **SNS 자동운영 솔루션을 제안**하기 위한 "예시 콘텐츠 레퍼런스"를
> 처음부터 끝까지 만들어내는 Claude 스킬입니다. 브랜드 웹사이트/검색으로 브랜드를 분석하고,
> 실제 이미지를 수집해, **인스타그램 캐러셀 · 네이버 블로그 · 유튜브 무드필름(힉스필드)** 을
> 브랜드 톤에 맞춰 감도 높게 제작하고, **하나의 웹 레퍼런스 페이지(Artifact) + 편집용 PPT**로
> 묶어 전달합니다.

이 패키지는 그 스킬을 **다른 Claude 환경에서도 그대로 쓸 수 있도록 압축한 것**이며,
지금까지 실제로 이 스킬로 진행한 **두 건의 작업 히스토리**(청담 먼데이투선데이, AWK 에어워크주니어)를
함께 기록해 두었습니다.

---

## 📦 패키지 구성

```
sns-레퍼런스-스킬-패키지/
├── README.md                        ← 지금 이 파일 (사용법 + 작업 히스토리)
└── sns-자동운영-레퍼런스-생성/       ← 스킬 본체 (이 폴더째로 설치)
    ├── SKILL.md                     ← 스킬 정의 + 6단계 파이프라인 상세
    └── scripts/                     ← 번들 템플릿 스크립트 11종
        ├── collect-assets.workflow.yml    # 브랜드 사이트 이미지 CI 수집기
        ├── build_ig_lookbook.py           # 인스타 캐러셀 (룩북형)
        ├── build_ig_poster.py             # 인스타 캐러셀 (포스터/저장각형)
        ├── build_video_overlays.py        # 유튜브 무드필름 인트로/자막 오버레이
        ├── generate_bgm_lounge.py         # BGM: 재즈 라운지 피아노 (럭셔리)
        ├── generate_bgm_pop.py            # BGM: 밝은 여름 팝 (영/액티브)
        ├── assemble-video.workflow.yml    # 무드필름 CI 합성 워크플로
        ├── assemble-video.sh              # 무드필름 ffmpeg 합성 스크립트
        ├── build_reference.py             # 자기완결형 레퍼런스 페이지 빌더
        ├── build_pptx.py                  # 편집용 PPT 빌더 (폰트 임베딩)
        └── pptx_preview.py                # PPT→SVG 검증 렌더러
```

---

## 🚀 다른 Claude에서 이 스킬 사용하기

### 방법 A — Claude Code (CLI / 웹 / IDE)

1. 압축을 풀고 `sns-자동운영-레퍼런스-생성/` 폴더 전체를 스킬 디렉토리에 복사합니다.
   - **프로젝트 단위로 쓰기**: `<프로젝트루트>/.claude/skills/sns-자동운영-레퍼런스-생성/`
   - **모든 프로젝트에서 쓰기(전역)**: `~/.claude/skills/sns-자동운영-레퍼런스-생성/`

   ```bash
   unzip sns-레퍼런스-스킬-패키지.zip
   mkdir -p ~/.claude/skills
   cp -r sns-레퍼런스-스킬-패키지/sns-자동운영-레퍼런스-생성 ~/.claude/skills/
   ```

2. 새 Claude Code 세션을 시작하면 스킬이 자동 인식됩니다.
   확인: 세션에서 `/` 를 눌러 스킬 목록에 `sns-자동운영-레퍼런스-생성` 이 보이면 성공.

3. 사용은 **자연어로** 하면 됩니다. 스킬이 자동으로 발동됩니다:
   > "○○ 브랜드(사이트: https://…) SNS 자동운영 제안용 레퍼런스 만들어줘.
   >  브랜드 분석하고 인스타/블로그/유튜브 예시 콘텐츠 감도 높게 만들어줘."

### 방법 B — claude.ai (웹/데스크톱 앱)

- 설정 → **Capabilities / Skills** 에서 스킬 폴더를 업로드하거나,
  프로젝트(Projects) 지식에 `SKILL.md` 와 `scripts/` 를 첨부해 참조시킵니다.
- 환경에 따라 스킬 업로드 UI가 없을 수 있는데, 그럴 땐 `SKILL.md` 본문을 대화 초반에
  붙여넣고 "이 파이프라인대로 진행해줘"라고 지시하면 동일하게 동작합니다.

### ⚠️ 사용 전 준비물 (스킬이 기대하는 환경)

이 스킬은 **PSLAB의 SNS 자동운영 프로젝트 환경**을 전제로 설계됐습니다. 다른 환경에서 쓸 때 필요:

| 필요 | 용도 | 없을 때 |
|---|---|---|
| **GitHub 저장소 + Actions** | 외부 이미지/영상 수집·영상 합성(개발환경 프록시가 외부 호스트를 차단하므로 CI 러너에서 수행) | 로컬 인터넷이 열려 있으면 CI 대신 직접 다운로드로 대체 가능 |
| **Higgsfield MCP** | 유튜브 무드필름(이미지→시네마틱 영상) | 유튜브 파트만 생략하거나 다른 영상 툴로 대체 |
| **Pretendard 폰트** (`assets/fonts/Pretendard-*.otf`) | 인스타 카드·PPT 한글 렌더/임베딩 | 다른 한글 폰트로 교체 (스크립트 상단 상수 수정) |
| **Python**: `numpy`, `Pillow`, `python-pptx`, `fonttools`, `imageio-ffmpeg`, `otf2ttf` | 카드/BGM/PPT/폰트서브셋/프레임검증 | 필요 시 `pip install` |
| **Chromium** (Playwright) | HTML 카드 → PNG 스크린샷 렌더 | Playwright 기본 제공 |

> 스크립트 상단의 경로 상수(`SP`, `FONT` 등)는 이 세션 기준 절대경로로 박혀 있으니,
> **새 환경에선 경로부터 자기 환경에 맞게 교체**하세요.

---

## 🧭 파이프라인 6단계 (요약)

자세한 내용은 `SKILL.md` 참고. 핵심만:

1. **브랜드 분석** — 사이트 WebFetch(403이면 CI 스크레이퍼) + WebSearch/네이버검색.
   업종·운영사·슬로건·가격대·타겟·톤앤무드 정리 → **서사 훅(narrative hook)** 하나 도출.
2. **실제 이미지 수집 (CI)** — `collect-assets.workflow.yml` 로 브랜드 사이트 이미지 다운로드→커밋→pull.
   컨택트시트로 눈 검증 후 라이프스타일/인물 컷 위주 선별.
3. **인스타그램 캐러셀** — 룩북형(`build_ig_lookbook.py`) 또는 포스터/저장각형(`build_ig_poster.py`).
   HTML+Pretendard를 Chromium으로 1080×1350 카드 렌더. **하단 잘림 반드시 확인**.
4. **네이버 블로그** — 검색의도 SEO 롱폼 + 실제 이미지 배치 + 정보박스 + 태그.
5. **유튜브 무드필름 (힉스필드)** — 라이프스타일 컷 4개를 `media_import_url`→`generate_video`
   (kling3_0_turbo, 9:16). 오버레이(자막) + **직접 작곡 BGM(numpy, 저작권 free)** + CI ffmpeg 합성.
6. **레퍼런스 페이지 + PPT** — `build_reference.py`(base64 인라인 자기완결형 Artifact) +
   `build_pptx.py`(Pretendard 임베딩 편집용 PPT).

> **핵심 원칙**: 브랜드마다 색·폰트·BGM·서사를 **완전히 새로** 디자인한다.
> 스크립트는 출발점일 뿐 복붙 대상이 아니다.

---

## 📚 작업 히스토리 (이 스킬로 실제 만든 레퍼런스)

### 1) 청담 먼데이투선데이 — 웜 럭셔리 다이닝 (지난주)

- **업종**: 청담동 다이닝 바 / 브런치~심야 와인
- **서사 훅**: "하루의 모든 순간" (브런치 → 낮 → 저녁 → 밤 와인)
- **디자인 방향**: 다크 배경(#06070B) · 세리프 믹스 · 앰버/골드 포인트 · 재즈 라운지 피아노 BGM
- **BGM 히스토리**: 초기 단순 신스 패드 → 사용자 요청("고급스럽고 우아한 bgm")으로
  **재즈 라운지 피아노(Cmaj9–Am11–Dm9–G13, FFT 컨볼루션 리버브)** 재작곡 후 교체.
- **결과물**:
  - 웹 레퍼런스 페이지: https://claude.ai/code/artifact/13d9207b-34b0-4189-9846-498cbd46d4d7
  - 유튜브 무드필름 mp4, 인스타 캐러셀 6컷, 네이버 블로그 목업 (저장소 커밋)
- **저장소 산출물**(브랜치 `claude/eager-mayer-tknneh`):
  `assets/mts-video/mts-mood-film.mp4`, `assets/mts-content/ig-carousel-{1-6}.png`,
  `scripts/mts-video.sh`, `data/mts-video.json`, `.github/workflows/mts-video.yml` 등
- **PPT**: 아직 별도 제안서 PPT는 미제작 (레퍼런스 페이지 + 미디어 결과물로 구성).

### 2) AWK 에어워크주니어 — 밝은 스포티 주니어 패션 (최근)

- **업종**: 주니어/키즈 패션몰 (제이씨물산) · https://awkmall.com
- **서사 훅**: "가장 활발한 나이의 여름" (아이의 액티브한 하루 / 여름방학)
- **디자인 방향**: 화이트 배경 · 볼드 산세리프 · 코발트 블루 + 코랄 포인트 · 밝은 여름 팝 BGM
- **인스타그램 2건**:
  - POST 1 (룩북형) — "우리 아이의 여름 룩북" 6컷 (커버 + 밴드형 제품 4컷 + 마감)
  - POST 2 (포스터/저장각형) — "여름방학 필수템 TOP 5" 7컷 (리본 커버 + 스티커 넘버 5컷 + 체크리스트 마감)
    → 시의성(여름방학) 반영, 더 트렌디한 저장각 포맷
- **결과물**:
  - 웹 레퍼런스 페이지: https://claude.ai/code/artifact/3ce8a518-d1b3-477c-88df-672c804a3c8d
  - 편집용 제안서 PPT (8슬라이드, Pretendard 임베딩):
    https://github.com/leejiho-pslab/pslab/raw/claude/eager-mayer-tknneh/deliverables/AWK-airwalk-junior-proposal.pptx
- **저장소 산출물**(브랜치 `claude/eager-mayer-tknneh`):
  `assets/awk/awk-0XX.jpg`(실제 스크랩 이미지), `assets/awk-content/awk-carousel-{1-6}.png`,
  `assets/awk-content/awk2-vacation-{1-7}.png`, `assets/awk-video/awk-mood-film.mp4`,
  `scripts/awk-video.sh`, `.github/workflows/awk-assets.yml`, `.github/workflows/awk-video.yml` 등
- **버그 수정 이력**: 캐러셀 카드 하단 텍스트 잘림 → 하단 여백/자막 길이 조정 후
  "하단 200px 크롭 검증"으로 13컷 전부 잘림 없음 확인. (이 교훈이 SKILL.md §③ 경고로 반영됨)

### 두 프로젝트가 남긴 재사용 자산 = 이 스킬

위 두 건을 만들며 확립한 **CI 기반 외부자산 수집 패턴**, **PPT 폰트 임베딩 레시피**,
**브랜드별 톤 재설계 원칙**, **numpy BGM 작곡 2종**, **인스타 카드 2포맷**을 그대로 템플릿화한 것이
`scripts/` 의 11개 파일입니다. 두 브랜드의 대비(럭셔리 vs 영·액티브)는 SKILL.md §4 표에 정리돼 있습니다.

---

## 🔧 환경 제약 (반드시 숙지)

- **개발환경 프록시가 외부 이미지/영상 호스트를 전부 차단(403/000)** → 브랜드 사이트 이미지,
  Higgsfield cloudfront mp4 등은 **직접 다운로드 불가**. **GitHub Actions 러너에서 받아 커밋 후 pull**.
- **LibreOffice 동작 안 함** → PPT를 실제로 못 엶. `pptx_preview.py`(pptx→SVG 렌더러)로 레이아웃 검증.
- **로컬 ffmpeg 없음** → `pip install imageio-ffmpeg` 로 확보(프레임 추출·웹압축·오디오 믹스).
  단, 브랜드 clip 다운로드+합성은 cloudfront 차단 때문에 **CI에서** 수행.
- **소리를 들을 수 없음** → BGM은 스펙트로그램/RMS로, PPT/영상은 프레임 렌더로 **눈으로 검증**.

---

## ⚖️ 정직성·주의

- 이미지는 **브랜드 공개 자료**를 사용, 영상은 그 이미지를 AI(힉스필드)로 무빙 처리한 것임을
  레퍼런스에 명시("예시 레퍼런스 · 실제 집행 시 원본 고해상도로 교체 권장").
- 실존 인물(특히 아동 모델)은 브랜드 공식 카탈로그 컷에 한해 **잔잔한 무빙**만. 변형·합성 프롬프트 금지.
- 이 레퍼런스는 **제안용 시안**이며, 실제 계약·집행 시에는 브랜드 승인 및 원본 소스 교체를 전제로 함.

---

_생성: PSLAB SNS 자동운영 프로젝트 · 참고 구현 = 청담 먼데이투선데이(웜 럭셔리) · AWK 에어워크주니어(밝은 스포티)_
