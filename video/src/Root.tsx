import "./index.css";
import { Composition } from "remotion";
import { calculateReelMetadata, Reel, reelSchema } from "./Reel";
import { PREVIEW_REEL } from "./preview-props";

/**
 * 컴포지션은 릴스 하나뿐이다. 실제 값은 전부 props(타임라인 IR)로 들어온다.
 *   · CI/배치 렌더 : scripts/render-reels-remotion.mjs 가 IR 을 만들어 주입
 *   · 스튜디오 미리보기 : 아래 defaultProps (클립 없이 자막 디자인만 확인 가능)
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Reel"
      component={Reel}
      schema={reelSchema}
      calculateMetadata={calculateReelMetadata}
      defaultProps={PREVIEW_REEL}
      // calculateMetadata 가 덮어쓰지만 Composition 은 초기값을 요구한다
      fps={PREVIEW_REEL.fps}
      width={PREVIEW_REEL.width}
      height={PREVIEW_REEL.height}
      durationInFrames={PREVIEW_REEL.durationInFrames}
    />
  );
};
