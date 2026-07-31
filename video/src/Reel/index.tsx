import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
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
                    // 밀어 올리는 컷은 스프링으로 — 등속 슬라이드는 값싸 보인다.
                    // 디졸브는 등속이 맞다(스프링을 걸면 밝기가 출렁인다).
                    timing={
                      tr.type === "slideup"
                        ? springTiming({
                            config: { damping: 200 },
                            durationInFrames: tr.durationInFrames,
                          })
                        : linearTiming({ durationInFrames: tr.durationInFrames })
                    }
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

        {/* 전체 진행 바 — "얼마 안 남았다"는 신호가 이탈을 늦춘다.
            씬 위에 얹어야 하므로 TransitionSeries 바깥에 둔다. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 6,
            background: "rgba(255,255,255,.12)",
          }}
        >
          <div
            style={{
              width: `${(frame / durationInFrames) * 100}%`,
              height: "100%",
              background: theme.accent,
              boxShadow: `0 0 14px ${theme.accent}`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
