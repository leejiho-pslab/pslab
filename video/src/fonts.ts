import { continueRender, delayRender, staticFile } from "remotion";

/**
 * Pretendard 로컬 로드.
 *
 * 폰트 파일은 저장소의 assets/fonts 에 있고, 렌더 직전 브리지 스크립트가
 * public/fonts 로 복사한다(video/public/fonts 는 gitignore 대상).
 * 없으면 조용히 폴백 — 스튜디오에서 IR 만 보고 싶을 때 렌더가 멈추면 곤란하다.
 */
const WEIGHTS = [
  { file: "Pretendard-ExtraBold.otf", weight: "800" },
  { file: "Pretendard-Bold.otf", weight: "700" },
];

export const FONT_FAMILY = "Pretendard, system-ui, sans-serif";

let started = false;

export const loadFonts = () => {
  if (started || typeof document === "undefined") return;
  started = true;

  for (const { file, weight } of WEIGHTS) {
    const handle = delayRender(`Pretendard ${weight} 로드`);
    const face = new FontFace(
      "Pretendard",
      `url(${staticFile(`fonts/${file}`)}) format("opentype")`,
      { weight },
    );
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch(() => {
        // 폰트가 없어도 렌더는 진행시킨다 (시스템 폰트로 대체)
        continueRender(handle);
      });
  }
};
