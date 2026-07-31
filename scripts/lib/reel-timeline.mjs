/**
 * 릴스 타임라인 IR (Intermediate Representation) — 렌더러 중립 포맷
 *
 * 왜 별도 모듈인가:
 *   씬 대본(reel-scenes.json)과 디자인 토큰은 하나인데, 이걸 소비하는 렌더러는 여럿이다.
 *     · Remotion   — 코드 합성 (기본 엔진)
 *     · ffmpeg     — 기존 build-reels.mjs (폴백)
 *     · 캡컷 draft — 사람이 손편집하는 경로 (다음 단계)
 *   각 렌더러가 reel-scenes.json 을 제각각 해석하면 셋의 결과가 갈라진다.
 *   그래서 "몇 프레임에 무슨 클립·무슨 자막" 까지만 여기서 확정하고,
 *   그 뒤 그리는 방법만 렌더러가 각자 책임진다.
 *
 * 이 모듈은 순수 함수만 둔다(파일 IO·네트워크 없음) — 테스트가 쉬워야 해서.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** 테마 기본값. data/clients/<id>/design-tokens.json 의 reels 섹션이 덮어쓴다. */
export const DEFAULT_THEME = {
  cinematic: { accent: '#ff8a3d', kicker: '#ffb37a' },
  premium: { accent: '#ffc24a', kicker: '#ffd98a' },
};

/** 컷마다 전환을 바꿔 "편집된 영상"의 리듬을 만든다 (기존 ffmpeg 경로와 동일 순서) */
const TRANSITIONS = ['fade', 'slideup', 'fade', 'slideup'];

export const secToFrames = (sec) => Math.round(sec * FPS);

/**
 * design-tokens.json 의 reels 섹션을 기본 테마에 병합한다.
 * @param {object|null} reelTokens design-tokens.json 의 `reels` 값
 */
export function mergeTheme(reelTokens) {
  return Object.fromEntries(
    Object.entries(DEFAULT_THEME).map(([k, v]) => [k, { ...v, ...(reelTokens?.[k] ?? {}) }]),
  );
}

/**
 * 한 줄 안에서 액센트 문구를 잘라 세그먼트 배열로 만든다.
 * "3주 멈춘 계정은" + accent "닫힌 가게" → [{text,accent:false}, ...]
 * 액센트가 그 줄에 없으면 세그먼트 하나만 나온다.
 */
export function segmentLine(line, accent) {
  if (!accent) return [{ text: line, accent: false }];
  const i = line.indexOf(accent);
  if (i < 0) return [{ text: line, accent: false }];
  const out = [];
  if (i > 0) out.push({ text: line.slice(0, i), accent: false });
  out.push({ text: accent, accent: true });
  const rest = line.slice(i + accent.length);
  if (rest) out.push({ text: rest, accent: false });
  return out;
}

/**
 * 씬 대본 → 타임라인 IR.
 *
 * @param {object}   p
 * @param {string}   p.itemId    plan.json 항목 id (= 출력 파일명)
 * @param {object}   p.cfg       reel-scenes.json 의 reels[itemId]
 * @param {object}   p.defaults  reel-scenes.json 의 defaults
 * @param {object}   p.themes    mergeTheme() 결과
 * @param {string}   p.brand     워터마크 문구 (예: '@_pslab')
 * @param {(beat, i) => string} p.resolveClip
 *        비트 i 의 클립을 렌더러가 읽을 수 있는 경로로 바꾸는 함수.
 *        (Remotion 은 public/ 상대경로, ffmpeg 은 절대경로가 필요해 호출자가 정한다)
 * @returns {object|null} 클립이 2개 미만이면 null (합성 불가)
 */
export function buildTimeline({ itemId, cfg, defaults = {}, themes, brand, resolveClip }) {
  // 아직 클립이 준비되지 않은 비트는 뺀다 — 부분 완성 상태에서도 나머지로 합성한다.
  const beats = (cfg.beats || []).filter((b) => /^https?:\/\//.test(b.clip ?? ''));
  if (beats.length < 2) return null;

  const sceneFrames = secToFrames(defaults.beatSec ?? 3.5);
  const xfadeFrames = secToFrames(defaults.xfade ?? 0.3);
  const theme = themes[cfg.theme] ?? themes.cinematic;

  const scenes = beats.map((b, i) => ({
    index: i,
    durationInFrames: sceneFrames,
    clip: { url: b.clip, src: resolveClip(b, i) },
    kicker: b.kicker || '',
    lines: String(b.text ?? '').split('\n').map((ln) => segmentLine(ln, b.accent)),
    accent: b.accent ?? '',
    // 장면 지시문 — 렌더에는 안 쓰지만 캡컷 드래프트/사람 검수 때 필요해 남긴다.
    note: b.scene ?? '',
  }));

  // TransitionSeries 총 길이 = 씬 합계 − 전환 합계 (기존 xfade 공식과 동일)
  const durationInFrames = scenes.length * sceneFrames - (scenes.length - 1) * xfadeFrames;

  return {
    itemId,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    durationInFrames,
    theme,
    brand,
    transitions: scenes.slice(1).map((_, i) => ({
      type: TRANSITIONS[i % TRANSITIONS.length],
      durationInFrames: xfadeFrames,
    })),
    scenes,
  };
}
