import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_FAMILY } from "../fonts";
import type { ReelProps, SceneProps } from "./schema";

/**
 * 씬 1개 = 힉스필드 클립(배경) + 브랜드 자막 레이어.
 *
 * ffmpeg 폴백(scripts/build-reels.mjs)과 레이아웃·색·기본 타이밍은 같게 두되,
 * 아래 네 가지는 Remotion 에서만 하는 "완성도" 레이어다. ffmpeg 필터 표현식으로는
 * 표현이 안 되거나 유지보수가 불가능한 것들이라 의도적으로 격차를 뒀다.
 *   1) 켄번스 — 배경 클립이 씬 내내 아주 천천히 밀고 들어온다(정지 화면 느낌 제거)
 *   2) 단어 단위 등장 — 줄 통째가 아니라 단어가 차례로 튀어 오른다(스프링)
 *   3) 액센트 하이라이트 와이프 — 강조 밑줄이 왼쪽에서 그어진다
 *   4) 진행 도트가 활성 시 늘어난다
 *
 * 폴백으로 넘어가면 이 네 가지가 빠진 "같은 디자인의 담백한 판"이 나온다.
 */

/** 줄별 등장 시차 (초) */
const LINE_STAGGER = 0.25;
/** 한 줄 안에서 단어별 시차 (초) — 너무 크면 읽기 전에 문장이 안 완성된다 */
const WORD_STAGGER = 0.055;
const FADE_IN_AT = 0.03;
const FADE_OUT_DUR = 0.32;
const FADE_OUT_BEFORE_END = 0.4;
const SLIDE_PX = 44;

/** 하단 텍스트가 잘리지 않게 확보하는 세이프존 — ADR-0002 (≥135px) */
const SAFE_BOTTOM = 352;

type Props = {
  scene: SceneProps;
  theme: ReelProps["theme"];
  brand: string;
  total: number;
};

/** 씬 끝에서 다 같이 사라지는 페이드아웃 (초 단위 t 기준) */
const useOutro = (sceneDurationInFrames: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = sceneDurationInFrames / fps - FADE_OUT_BEFORE_END;
  return interpolate(frame / fps, [at, at + FADE_OUT_DUR], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
};

/** 스크림·키커·도트·워터마크처럼 통째로 떠오르는 요소 */
const useChrome = (sceneDurationInFrames: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const outro = useOutro(sceneDurationInFrames);
  const fadeIn = interpolate(t, [FADE_IN_AT, FADE_IN_AT + 0.34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(t, [0, 0.4], [SLIDE_PX, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return {
    opacity: Math.min(fadeIn, outro),
    transform: `translateY(${y}px)`,
  };
};

/** 세그먼트를 단어 토큰으로 펼친다 (공백은 앞 단어에 붙여 줄바꿈 위치를 보존) */
type Token = { text: string; accent: boolean; index: number };
const tokenize = (segments: SceneProps["lines"][number]): Token[] => {
  const out: Token[] = [];
  for (const seg of segments) {
    for (const w of seg.text.split(/(\s+)/)) {
      if (w === "") continue;
      if (/^\s+$/.test(w)) {
        // 공백은 직전 토큰에 흡수 — 별도 토큰이 되면 등장 순번이 밀린다
        if (out.length) out[out.length - 1].text += w;
        continue;
      }
      out.push({ text: w, accent: seg.accent, index: out.length });
    }
  }
  return out.map((t, i) => ({ ...t, index: i }));
};

/** 단어 하나 — 아래에서 스프링으로 튀어 오르며 나타난다 */
const Word: React.FC<{ token: Token; accent: string; delaySec: number }> = ({
  token,
  accent,
  delaySec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = Math.round(delaySec * fps);

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, stiffness: 170, mass: 0.7 },
    durationInFrames: Math.round(fps * 0.55),
  });
  const y = interpolate(enter, [0, 1], [SLIDE_PX, 0]);

  // 액센트 밑줄은 단어가 자리잡은 뒤 왼쪽에서 그어진다
  const wipe = interpolate(
    frame - delay,
    [Math.round(fps * 0.22), Math.round(fps * 0.52)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <span
      style={{
        display: "inline-block",
        whiteSpace: "pre",
        opacity: enter,
        transform: `translateY(${y}px)`,
        color: token.accent ? accent : "#fff",
        position: "relative",
      }}
    >
      {token.accent ? (
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
            transform: `scaleX(${wipe})`,
            transformOrigin: "left center",
          }}
        />
      ) : null}
      {token.text}
    </span>
  );
};

const Line: React.FC<{
  segments: SceneProps["lines"][number];
  accent: string;
  baseDelaySec: number;
  sceneDurationInFrames: number;
}> = ({ segments, accent, baseDelaySec, sceneDurationInFrames }) => {
  const outro = useOutro(sceneDurationInFrames);
  const tokens = tokenize(segments);
  return (
    <span
      style={{
        display: "block",
        fontWeight: 800,
        fontSize: 108,
        lineHeight: 1.22,
        letterSpacing: "-0.035em",
        wordBreak: "keep-all",
        textShadow: "0 6px 30px rgba(0,0,0,.75), 0 2px 8px rgba(0,0,0,.6)",
        opacity: outro,
      }}
    >
      {tokens.map((tk) => (
        <Word
          key={tk.index}
          token={tk}
          accent={accent}
          delaySec={baseDelaySec + tk.index * WORD_STAGGER}
        />
      ))}
    </span>
  );
};

export const Scene: React.FC<Props> = ({ scene, theme, brand, total }) => {
  const dur = scene.durationInFrames;
  const frame = useCurrentFrame();
  const chrome = useChrome(dur);

  // 켄번스 — 씬마다 방향을 번갈아 줘서 네 컷이 같은 리듬으로 밀리지 않게 한다
  const p = interpolate(frame, [0, dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zoomIn = scene.index % 2 === 0;
  const scale = zoomIn ? 1.05 + p * 0.09 : 1.14 - p * 0.09;
  const drift = (zoomIn ? 1 : -1) * (p - 0.5) * 26;

  return (
    <AbsoluteFill style={{ backgroundColor: "#060a12", fontFamily: FONT_FAMILY }}>
      {/* 배경: 힉스필드 클립. 커버 크롭 + 켄번스 + 미세 그레이딩.
          src 가 비면(클립 미스테이징) 플레이스홀더 — 스튜디오에서 클립 없이
          자막 디자인만 손볼 수 있게 열어둔다. */}
      <AbsoluteFill
        style={{
          filter: "contrast(1.06) saturate(1.08) brightness(0.988)",
          overflow: "hidden",
        }}
      >
        <AbsoluteFill
          style={{
            transform: `scale(${scale}) translateY(${drift}px)`,
            transformOrigin: "center center",
          }}
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
                background:
                  "linear-gradient(155deg, #16203a 0%, #0b1020 55%, #1b1208 100%)",
              }}
            />
          )}
        </AbsoluteFill>
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

      {/* 본문 자막 — 줄마다, 그리고 줄 안에서 단어마다 시차를 두고 올라온다 */}
      <div style={{ position: "absolute", left: 84, right: 84, bottom: 520 }}>
        {scene.lines.map((segments, i) => (
          <Line
            key={i}
            segments={segments}
            accent={theme.accent}
            baseDelaySec={i * LINE_STAGGER}
            sceneDurationInFrames={dur}
          />
        ))}
      </div>

      {/* 진행 도트 — 활성 항목은 길게 늘어난다 */}
      <div
        style={{
          ...chrome,
          position: "absolute",
          left: 84,
          bottom: 440,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const on = i === scene.index;
          const grow = interpolate(frame, [0, Math.round(dur * 0.25)], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                width: on ? 30 + 42 * grow : 30,
                height: 7,
                borderRadius: 6,
                background: on ? theme.accent : "rgba(255,255,255,.28)",
                boxShadow: on ? `0 0 16px ${theme.accent}` : "none",
              }}
            />
          );
        })}
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
