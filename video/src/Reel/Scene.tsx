import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_FAMILY } from "../fonts";
import type { ReelProps, SceneProps } from "./schema";

/**
 * 씬 1개 = 힉스필드 클립(배경) + 브랜드 자막 레이어.
 *
 * 타이밍·수치는 기존 ffmpeg 경로(scripts/build-reels.mjs)와 의도적으로 동일하게 맞췄다.
 * 두 엔진이 같은 그림을 내야 폴백이 폴백 구실을 한다.
 *   · 자막 1행 즉시 / 2행 0.25s 뒤 — 아래에서 44px 슬라이드업 + 페이드인
 *   · 배경 그레이딩 eq=contrast=1.06:saturation=1.08:brightness=-0.012 + vignette
 */

/** 줄별 등장 시차 (초) — 기존: 1행 0s, 2행 0.25s */
const LINE_STAGGER = 0.25;
const FADE_IN_AT = 0.03;
const FADE_IN_DUR = 0.34;
const FADE_OUT_DUR = 0.32;
const FADE_OUT_BEFORE_END = 0.4;
const SLIDE_PX = 44;
const SLIDE_DUR = 0.4;

/** 하단 텍스트가 잘리지 않게 확보하는 세이프존 — ADR-0002 (≥135px) */
const SAFE_BOTTOM = 352;

type Props = {
  scene: SceneProps;
  theme: ReelProps["theme"];
  brand: string;
  total: number;
};

/** 아래에서 올라오며 나타나는 요소의 opacity·translateY 를 계산 */
const useReveal = (delaySec: number, sceneDurationInFrames: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const durSec = sceneDurationInFrames / fps;

  const fadeIn = interpolate(
    t,
    [FADE_IN_AT + delaySec, FADE_IN_AT + delaySec + FADE_IN_DUR],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const fadeOutAt = durSec - FADE_OUT_BEFORE_END;
  const fadeOut = interpolate(t, [fadeOutAt, fadeOutAt + FADE_OUT_DUR], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(t, [delaySec, delaySec + SLIDE_DUR], [SLIDE_PX, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return { opacity: Math.min(fadeIn, fadeOut), transform: `translateY(${y}px)` };
};

const Line: React.FC<{
  segments: SceneProps["lines"][number];
  accent: string;
}> = ({ segments, accent }) => (
  <span
    style={{
      display: "block",
      fontWeight: 800,
      fontSize: 108,
      lineHeight: 1.22,
      letterSpacing: "-0.035em",
      color: "#fff",
      wordBreak: "keep-all",
      textShadow: "0 6px 30px rgba(0,0,0,.75), 0 2px 8px rgba(0,0,0,.6)",
    }}
  >
    {segments.map((seg, i) =>
      seg.accent ? (
        <span
          key={i}
          style={{ color: accent, position: "relative", whiteSpace: "nowrap" }}
        >
          {/* 액센트 밑줄 하이라이트 — 텍스트 뒤에 깔린다 */}
          <span
            style={{
              position: "absolute",
              left: -4,
              right: -4,
              bottom: 6,
              height: 16,
              borderRadius: 8,
              background: accent,
              opacity: 0.22,
              zIndex: -1,
            }}
          />
          {seg.text}
        </span>
      ) : (
        <React.Fragment key={i}>{seg.text}</React.Fragment>
      ),
    )}
  </span>
);

export const Scene: React.FC<Props> = ({ scene, theme, brand, total }) => {
  const dur = scene.durationInFrames;
  const chrome = useReveal(0, dur);

  return (
    <AbsoluteFill style={{ backgroundColor: "#060a12", fontFamily: FONT_FAMILY }}>
      {/* 배경: 힉스필드 클립. 1080x1920 커버 크롭 + 미세 그레이딩.
          src 가 비면(클립 미스테이징) 플레이스홀더 — 스튜디오에서 클립 없이
          자막 디자인만 손볼 수 있게 열어둔다. */}
      <AbsoluteFill
        style={{ filter: "contrast(1.06) saturate(1.08) brightness(0.988)" }}
      >
        {scene.clip.src ? (
          <OffthreadVideo
            src={staticFile(scene.clip.src)}
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <AbsoluteFill
            style={{
              background: `linear-gradient(155deg, #16203a 0%, #0b1020 55%, #1b1208 100%)`,
            }}
          />
        )}
      </AbsoluteFill>

      {/* 비네트 */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,.45) 100%)",
        }}
      />

      {/* 상단·하단 스크림 — 자막 가독성 */}
      <div style={{ ...chrome, position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 420,
            background:
              "linear-gradient(180deg, rgba(6,10,18,.55) 0%, rgba(6,10,18,0) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 1180,
            background:
              "linear-gradient(180deg, rgba(6,10,18,0) 0%, rgba(6,10,18,.35) 30%, rgba(6,10,18,.80) 62%, rgba(6,10,18,.93) 100%)",
          }}
        />
      </div>

      {/* 키커 */}
      {scene.kicker ? (
        <div
          style={{
            ...chrome,
            position: "absolute",
            top: 150,
            left: 84,
            fontWeight: 800,
            fontSize: 38,
            letterSpacing: "0.28em",
            color: theme.kicker,
            textTransform: "uppercase",
            textShadow: "0 3px 18px rgba(0,0,0,.7)",
          }}
        >
          {scene.kicker}
        </div>
      ) : null}

      {/* 본문 자막 — 줄마다 시차를 두고 올라온다 */}
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 520 }}>
        {scene.lines.map((segments, i) => (
          <StaggeredLine
            key={i}
            segments={segments}
            accent={theme.accent}
            delaySec={i * LINE_STAGGER}
            sceneDurationInFrames={dur}
          />
        ))}
      </div>

      {/* 진행 도트 */}
      <div
        style={{
          ...chrome,
          position: "absolute",
          left: 84,
          bottom: 440,
          display: "flex",
          gap: 14,
        }}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            style={{
              width: 56,
              height: 7,
              borderRadius: 6,
              background:
                i === scene.index ? theme.accent : "rgba(255,255,255,.28)",
              boxShadow: i === scene.index ? `0 0 16px ${theme.accent}` : "none",
            }}
          />
        ))}
      </div>

      {/* 브랜드 워터마크 */}
      <div
        style={{
          ...chrome,
          position: "absolute",
          left: 84,
          bottom: SAFE_BOTTOM,
          fontWeight: 700,
          fontSize: 34,
          color: "rgba(255,255,255,.72)",
          letterSpacing: "0.02em",
          textShadow: "0 2px 12px rgba(0,0,0,.7)",
        }}
      >
        {brand}
      </div>
    </AbsoluteFill>
  );
};

const StaggeredLine: React.FC<{
  segments: SceneProps["lines"][number];
  accent: string;
  delaySec: number;
  sceneDurationInFrames: number;
}> = ({ segments, accent, delaySec, sceneDurationInFrames }) => {
  const style = useReveal(delaySec, sceneDurationInFrames);
  return (
    <div style={style}>
      <Line segments={segments} accent={accent} />
    </div>
  );
};
