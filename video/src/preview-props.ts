import type { ReelProps } from "./Reel";

/**
 * 스튜디오 미리보기용 기본 IR.
 *
 * clip.src 를 비워둬 힉스필드 클립 없이도 열린다 — 자막 타이포/타이밍만
 * 손보고 싶을 때 클립 다운로드를 기다릴 이유가 없다.
 * 실제 클립까지 얹어 보려면:
 *   node scripts/render-reels-remotion.mjs --client pslab --stage-only
 *   cd video && npx remotion studio --props=out/props/reels-07-27.json
 */
const scene = (
  index: number,
  kicker: string,
  lines: string[][],
  accent: string,
) => ({
  index,
  durationInFrames: 105,
  clip: { url: "", src: "" },
  kicker,
  lines: lines.map((segs) =>
    segs.map((text, i) => ({ text, accent: i % 2 === 1 })),
  ),
  accent,
  note: "미리보기 더미 씬",
});

export const PREVIEW_REEL: ReelProps = {
  itemId: "preview",
  fps: 30,
  width: 1080,
  height: 1920,
  durationInFrames: 105 * 4 - 9 * 3,
  theme: { accent: "#ff8a3d", kicker: "#ffb37a" },
  brand: "@_pslab",
  transitions: [
    { type: "fade", durationInFrames: 9 },
    { type: "slideup", durationInFrames: 9 },
    { type: "fade", durationInFrames: 9 },
  ],
  scenes: [
    scene(0, "ALWAYS ON", [["마지막 게시물,"], ["", "언제", " 올리셨어요?"]], "언제"),
    scene(1, "", [["3주 멈춘 계정은"], ["손님 눈엔 ", "닫힌 가게"]], "닫힌 가게"),
    scene(2, "", [["이제 5채널이"], ["", "매일 자동으로"]], "매일 자동으로"),
    scene(3, "P.S.LAB", [["댓글에 ", "“온”"], ["소개서 보내드려요"]], "“온”"),
  ],
};
