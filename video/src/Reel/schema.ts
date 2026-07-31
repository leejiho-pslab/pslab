import { z } from "zod";

/**
 * 타임라인 IR 스키마 — scripts/lib/reel-timeline.mjs 의 buildTimeline() 출력과 1:1.
 *
 * 이 파일이 두 저장소 경계의 계약서다. IR 모듈을 고치면 여기도 같이 고쳐야 하고,
 * 어긋나면 렌더가 zod 검증에서 바로 터진다(조용히 잘못 그려지는 것보다 낫다).
 */

export const segmentSchema = z.object({
  text: z.string(),
  accent: z.boolean(),
});

export const sceneSchema = z.object({
  index: z.number().int(),
  durationInFrames: z.number().int().positive(),
  clip: z.object({
    /** 힉스필드 원본 URL — 렌더에는 안 쓰고 추적용으로만 남긴다 */
    url: z.string(),
    /** public/ 기준 상대경로 (staticFile 로 읽는다) */
    src: z.string(),
  }),
  kicker: z.string(),
  /** 줄 단위 → 그 줄 안의 액센트 세그먼트 */
  lines: z.array(z.array(segmentSchema)),
  accent: z.string(),
  note: z.string(),
});

export const reelSchema = z.object({
  itemId: z.string(),
  fps: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
  theme: z.object({
    accent: z.string(),
    kicker: z.string(),
  }),
  brand: z.string(),
  transitions: z.array(
    z.object({
      type: z.enum(["fade", "slideup"]),
      durationInFrames: z.number().int().positive(),
    }),
  ),
  scenes: z.array(sceneSchema).min(1),
});

export type ReelProps = z.infer<typeof reelSchema>;
export type SceneProps = z.infer<typeof sceneSchema>;
