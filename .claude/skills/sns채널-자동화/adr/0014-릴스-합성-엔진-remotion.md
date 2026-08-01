# ADR-0014: 릴스 합성 엔진을 Remotion 으로 — 힉스필드는 소재, Remotion은 편집

- **상태**: 채택됨
- **날짜**: 2026-07-31
- **관련 SKILL**: §8
- **관련 ADR**: ADR-0001(텍스트는 HTML 렌더), ADR-0002(하단 세이프존), ADR-0009(계정핸들 단일출처)

## 맥락 (Context)

릴스·쇼츠 영상은 두 단계로 만들어진다.

1. **소재 생성** — 힉스필드가 대본 비트마다 장면 클립(mp4)을 만든다.
2. **편집·합성** — 그 클립 위에 자막·전환·브랜드 요소를 얹어 한 편으로 붙인다.

1단계는 힉스필드가 잘한다. 문제는 2단계였다. `scripts/build-reels.mjs` 는
**씬마다 자막 PNG 2장을 헤드리스 크로미움으로 찍고, ffmpeg `filter_complex` 로
오버레이·슬라이드·크로스페이드를 계산**하는 방식이다. 돌아가긴 하지만:

- 자막 애니메이션이 `overlay=y='44*clip(1-(t-0.25)/0.40,0,1)'` 같은 **필터 표현식 문자열**에
  들어있다. 타이밍 하나 바꾸려면 이 문자열을 고쳐야 하고, 결과는 렌더를 끝까지 돌려야 보인다.
- 씬당 PNG 2장이라는 제약 때문에 "2행 자막"이 사실상 상한이었다. 3행·단어 단위 등장·
  숫자 카운트업 같은 건 표현식으로는 감당이 안 된다.
- 미리보기가 없다. 15초짜리 한 편을 통째로 렌더해야 결과를 볼 수 있다.

편집 로직이 늘어날수록 이 방식은 비용이 급격히 오른다. 앞으로 **캡컷 연동**(ADR-0015)까지
붙이려면 "타임라인"을 다룰 수 있는 표현이 필요했다.

## 결정 (Decision)

**릴스 합성의 기본 엔진을 Remotion(React 기반 영상 합성)으로 바꾼다.**
힉스필드의 역할은 그대로 — **소재 생성**. Remotion 이 **편집**을 맡는다.

```
힉스필드(장면 클립)  ─┐
                     ├─→ reel-scenes.json ─→ 타임라인 IR ─┬─→ Remotion 렌더 (기본)
design-tokens.json ──┘   (scripts/lib/reel-timeline.mjs)  ├─→ ffmpeg 렌더 (폴백)
                                                          └─→ 캡컷 드래프트 (ADR-0015)
```

핵심은 **타임라인 IR(중간표현)을 렌더러와 분리**한 것이다. "몇 프레임에 무슨 클립·무슨 자막"
까지만 `scripts/lib/reel-timeline.mjs` 가 확정하고, 그리는 방법은 렌더러가 각자 책임진다.
엔진이 셋으로 늘어도 대본 해석은 한 곳에만 있다.

구성:

| 파일 | 역할 |
|---|---|
| `scripts/lib/reel-timeline.mjs` | 타임라인 IR 빌더 (순수 함수, 렌더러 중립) |
| `scripts/lib/download.mjs` | 힉스필드 클립 다운로드 (URL 스탬프 캐시) |
| `scripts/render-reels-remotion.mjs` | 브리지 — 클립·폰트 스테이징 → 렌더 호출 → plan.json 갱신 |
| `video/` | Remotion 프로젝트 (`Reel` 컴포지션 하나) |
| `video/render.mjs` | 배치 렌더러 — 번들 1회 생성 후 전 항목 재사용 |
| `scripts/build-reels.mjs` | 기존 ffmpeg 경로 — **폴백으로 유지** |

## 고려한 대안 (Options)

- **A안(채택) — Remotion 기본 + ffmpeg 폴백**
  자막이 React 컴포넌트가 되어 `interpolate()` 로 타이밍을 읽고 쓴다. `npx remotion studio` 로
  브라우저에서 프레임을 스크럽하며 디자인을 고칠 수 있다. 폴백을 남겨 CI 가 절대 빈손이 되지 않는다.
- **B안 — ffmpeg 유지하고 표현식만 정리**
  의존성이 안 늘어 매력적이었으나, 미리보기 부재와 표현식 상한이라는 근본 문제가 그대로다.
  캡컷 연동에 필요한 타임라인 개념도 여전히 없다.
- **C안 — Remotion 전면 교체(폴백 제거)**
  Remotion 은 헤드리스 크로미움을 받아와야 하고(네트워크 의존), CI 에서 실패하면 그날 영상이 통째로 없다.
  발행 파이프라인이 매일 도는 이상 단일 실패점을 만들 수 없다.
- **D안 — 캡컷만 쓰고 자동 합성 포기**
  사람이 매번 손편집해야 해서 "매일 자동" 이라는 제품 주장 자체가 무너진다.

## 결과 (Consequences)

- (+) 자막 애니메이션이 코드가 됐다. 3행 이상·단어 단위 등장·카운트업 등이 이제 가능하다.
- (+) `npx remotion studio` 로 **렌더 없이 미리보기**. 클립이 없어도 자막 디자인만 볼 수 있게
  기본 props 를 넣어뒀다(`video/src/preview-props.ts`).
- (+) 타임라인 IR 덕분에 캡컷 내보내기가 "IR → 드래프트 변환" 한 단계로 줄었다.
- (+) 힉스필드 클립 캐시(URL 스탬프)로 재렌더가 네트워크를 다시 타지 않는다.
- (−) `video/` 가 별도 npm 프로젝트라 CI 에 `npm ci --prefix video` 가 붙는다(약 370 패키지).
- (−) Remotion 은 팀 3인까지 무료다. 인원이 늘면 상용 라이선스를 확인해야 한다.
- (−) 엔진이 둘이 됐다. 디자인을 고칠 때 두 곳을 봐야 한다 — 그래서 **기본 팔레트는
  `reel-timeline.mjs` 한 곳**에만 두고 양쪽이 `mergeTheme()` 을 공유하게 묶었다.

## 함정 — 헤드리스 브라우저 (중요)

Remotion 은 **구 headless 모드**를 쓰므로 최신 Chrome/Chromium 바이너리로는 못 띄운다:

```
Old Headless mode has been removed from the Chrome binary.
```

- **CI(GitHub Actions)**: Remotion 이 `chrome-headless-shell` 을 자동으로 받는다. 손댈 것 없음.
- **네트워크가 막힌 환경**: `remotion.media` 다운로드가 403 이 난다.
  시스템에 있는 headless shell 경로를 `PSLAB_CHROMIUM` 으로 지정한다.
  (예: `/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`)
  `/opt/pw-browsers/chromium`(일반 Chromium)을 주면 **실패한다** — 반드시 headless shell 이어야 한다.

한편 ADR-0002 의 하단 잘림은 **Remotion 경로에서는 재현되지 않는다**. `--window-size` 스크린샷이
아니라 뷰포트 고정 프레임 캡처라서다. 다만 두 엔진이 같은 그림을 내야 하므로 세이프존 값은 그대로 지킨다.

## 관련 파일

`scripts/lib/reel-timeline.mjs`, `scripts/lib/download.mjs`,
`scripts/render-reels-remotion.mjs`, `scripts/build-reels.mjs`,
`video/src/Reel/*`, `video/render.mjs`, `.github/workflows/pslab-cron.yml`
