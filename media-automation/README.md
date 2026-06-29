# 무겸 스튜디오 — 영상편집 · 썸네일 · 블로그 자동화

원본 영상 1개를 넣으면 **유튜브/인스타 편집본 + 썸네일**을 자동 생성하고,
**네이버 블로그 초안**을 하루 2회 자동으로 만들어 주는 자동화 패키지입니다.
모든 결과물은 **다운로드 → 직접 업로드/발행** 하는 구조입니다(계정 안전).

```
원본 영상 ─▶ 🎬 youtube_edit.mp4   (16:9, 인트로·자막바·아웃트로)
            📱 instagram_reel.mp4 (9:16 세로, 블러배경)
            🖼️ thumb_youtube.jpg   (1280×720)
            🖼️ thumb_instagram.jpg (1080×1350)

매일(스케줄) ─▶ ✍️ 네이버 블로그 초안 ×2 (시장조사→기획→SEO/GEO 원고)
```

## 폴더 구조
```
media-automation/
├─ brand.json            # 딜러 정보·색상·후킹 문구 (여기만 고치면 전체 반영)
├─ fonts/                # Pretendard (한글)
├─ input/                # ← 원본 영상을 여기에 올리면 자동 처리
├─ output/               # 결과물(영상·썸네일·블로그)
├─ scripts/
│  ├─ make_thumbnail.py  # 유튜브/인스타 썸네일
│  ├─ make_cards.py      # 인트로/아웃트로/자막바 카드
│  ├─ edit_video.py      # 영상 편집(유튜브+릴스)
│  └─ blog_generate.py   # 네이버 블로그 생성(Claude)
├─ github-workflows/     # ← .github/workflows/ 로 옮길 워크플로 2종
└─ requirements.txt
```

## 설치(권장: moomoo 저장소 루트)
1. 이 `media-automation/` 폴더를 대상 저장소 **루트**에 둔다.
2. `github-workflows/` 안의 두 파일을 저장소 **`.github/workflows/`** 로 옮긴다
   (`media-automation.yml`, `blog-automation.yml`).
3. 저장소 **Settings → Secrets → Actions** 에 등록:
   - `ANTHROPIC_API_KEY` (블로그 생성·필수)
   - `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (선택: 실검 트렌드 반영)

## 사용법
### ① 영상 편집 + 썸네일
- `media-automation/input/` 에 원본 영상(mp4/mov)을 올린다(커밋).
- `media-automation` 워크플로가 자동 실행 → **Actions 탭 → 해당 실행 → 하단 Artifacts → `media-output`** 다운로드.
- 결과: `youtube_edit.mp4`, `instagram_reel.mp4`, `thumb_youtube.jpg`, `thumb_instagram.jpg`.
- 각 채널에 그대로 업로드.

### ② 네이버 블로그(하루 2회)
- 스케줄(07:00·13:00 KST)에 자동 생성 → `output/blog/날짜/` 에 `.md` + `.meta.json` 커밋.
- 글 열어 본문 복사 → **네이버 블로그 글쓰기에 붙여넣기 → 발행**. 태그는 `.meta.json` 참고.
- ⚠️ 스케줄은 저장소 **기본 브랜치**에 워크플로가 있을 때만 동작.

## 커스터마이즈
- **문구·색상·후킹**: `brand.json` 수정.
- **릴스 길이/구간**: `edit_video.py <video> <out> [시작초] [길이초]`.
- **블로그 톤/규칙**: `blog_generate.py` 의 `SYSTEM` 프롬프트.
- **하루 편수**: 워크플로 `POSTS_PER_RUN` 또는 cron 횟수.

## 로컬 실행(선택)
```bash
pip install -r requirements.txt          # ffmpeg 필요(미설치 시 imageio-ffmpeg 사용)
python scripts/make_thumbnail.py input/영상.mp4 output/영상
python scripts/edit_video.py    input/영상.mp4 output/영상
ANTHROPIC_API_KEY=sk-... python scripts/blog_generate.py output/blog
```

## 한계 / 안전
- 네이버·인스타는 공식 자동게시 API가 제한적이라 **발행은 직접**(계정 정지 위험 회피).
- 유튜브는 추후 OAuth로 자동 업로드 확장 가능(원하면 추가).
- 영상의 음악/내레이션은 원본 오디오 유지. BGM·자동자막(STT)은 다음 단계에서 추가 가능.
