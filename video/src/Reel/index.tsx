import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { loadFonts } from "../fonts";
import { Scene } from "./Scene";
import type { ReelProps } from "./schema";

export { reelSchema } from "./schema";
export type { ReelProps } from "./schema";

/** 전체 페이드 인/아웃 (초) — 기존 ffmpeg 경로와 동일 */
const OPEN_FADE = 0.35;
const CLOSE_FADE = 0.45;

/** 컴포지션 길이·해상도를 props(IR)에서 그대로 받아온다 */
export const calculateReelMetadata = ({ props }: { props: ReelProps }) => ({
  durationInFrames: props.durationInFrames,
  fps: props.fps,
  width: props.width,
  height: props.height,
});

export const Reel: React.FC<ReelProps> = (props) => {
  loadFonts();
  const { scenes, transitions, theme, brand } = props;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // 오프닝/엔딩 암전
  const t = frame / fps;
  const total = durationInFrames / fps;
  const master = Math.min(
    interpolate(t, [0, OPEN_FADE], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
    interpolate(t, [total - CLOSE_FADE, total], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <AbsoluteFill style={{ opacity: master }}>
        <TransitionSeries>
          {scenes.map((scene, i) => {
            const tr = transitions[i - 1];
            return (
              <React.Fragment key={scene.index}>
                {i > 0 && tr ? (
                  <TransitionSeries.Transition
                    presentation={
                      tr.type === "slideup"
                        ? slide({ direction: "from-bottom" })
                        : fade()
                    }
                    timing={linearTiming({
                      durationInFrames: tr.durationInFrames,
                    })}
                  />
                ) : null}
                <TransitionSeries.Sequence
                  durationInFrames={scene.durationInFrames}
                >
                  <Scene
                    scene={scene}
                    theme={theme}
                    brand={brand}
                    total={scenes.length}
                  />
                </TransitionSeries.Sequence>
              </React.Fragment>
            );
          })}
        </TransitionSeries>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
