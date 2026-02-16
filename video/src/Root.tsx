import { Composition } from "remotion";
import { BookmarkDemo } from "./BookmarkDemo";

export const RemotionRoot = () => {
  return (
    <Composition
      id="BookmarkDemo"
      component={BookmarkDemo}
      durationInFrames={600}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
