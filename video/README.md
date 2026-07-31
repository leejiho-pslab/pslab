# video — 릴스 합성 엔진 (Remotion)

릴스·쇼츠의 **편집**을 담당한다. 장면 클립(소재)은 힉스필드가 만들고, 여기서는
그 위에 자막·전환·브랜드 요소를 얹어 한 편으로 붙인다.

> 결정 배경: [ADR-0014](../.claude/skills/sns채널-자동화/adr/0014-릴스-합성-엔진-remotion.md)

```
힉스필드(장면 클립)  ─┐
                     ├─→ reel-scenes.json ─→ 타임라인 IR ─┬─→ Remotion (여기)
design-tokens.json ──┘   scripts/lib/reel-timeline.mjs    ├─→ ffmpeg (폴백)
                                                          └─→ 캡컷 (ADR-0015, 예정)
```

## 이 폴더를 직접 실행할 일은 거의 없다

평소에는 **상위 저장소의 브리지 스크립트**를 쓴다. 클립 다운로드·폰트 스테이징·
`plan.json` 갱신까지 한 번에 처리한다.

```bash
# 저장소 루트에서
node scripts/render-reels-remotion.mjs --client pslab
node scripts/render-reels-remotion.mjs --client pslab --only reels-08-03
```

## 디자인을 손볼 때 — 스튜디오 미리보기

자막 타이포·타이밍을 고칠 때는 렌더를 돌리지 말고 스튜디오에서 프레임을 스크럽한다.

```bash
cd video && npm i && npx remotion studio
```

기본 props(`src/preview-props.ts`)가 들어있어 **힉스필드 클립 없이도 열린다**
(배경은 플레이스홀더 그라데이션). 실제 클립까지 얹어 보려면:

```bash
node scripts/render-reels-remotion.mjs --client pslab --stage-only   # 루트에서
cd video && npx remotion studio --props=out/props/reels-08-03.json
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/Root.tsx` | 컴포지션 등록 (`Reel` 하나뿐 — 값은 전부 props 로 들어온다) |
| `src/Reel/schema.ts` | 타임라인 IR 의 zod 스키마. `scripts/lib/reel-timeline.mjs` 출력과 1:1 |
| `src/Reel/index.tsx` | 씬 이어붙이기(TransitionSeries) + 오프닝/엔딩 암전 |
| `src/Reel/Scene.tsx` | 씬 1개 — 배경 클립 + 스크림·키커·자막·도트·워터마크 |
| `src/fonts.ts` | Pretendard 로컬 로드 |
| `render.mjs` | 배치 렌더러 — 번들 1회 생성 후 전 항목 재사용 |

`public/clips/`, `public/fonts/`, `out/` 은 브리지 스크립트가 매번 새로 만든다(gitignore).

## 함정 — 헤드리스 브라우저

Remotion 은 **구 headless 모드**를 쓴다. 최신 Chrome/Chromium 으로는 못 띄운다:

```
Old Headless mode has been removed from the Chrome binary.
```

- **CI(GitHub Actions)** — Remotion 이 `chrome-headless-shell` 을 자동으로 받는다. 손댈 것 없음.
- **네트워크가 막힌 환경** — `remotion.media` 다운로드가 403. headless shell 경로를 직접 준다:

  ```bash
  PSLAB_CHROMIUM=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell \
    node scripts/render-reels-remotion.mjs --client pslab
  ```

  일반 Chromium(`/opt/pw-browsers/chromium`)을 주면 **실패한다**. headless shell 이어야 한다.

## 라이선스

Remotion 은 팀 3인까지 무료. 인원이 늘면 <https://remotion.pro/license> 확인이 필요하다.
