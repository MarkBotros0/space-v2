import { forwardRef, useImperativeHandle } from "react";

/*
 * Jest stand-in for react-native-youtube-iframe, applied automatically to every
 * suite (a root-adjacent __mocks__ entry for a node module). The real module
 * pulls in react-native-webview, whose native module does not exist under the
 * test renderer — so any suite that merely imports a screen containing the
 * video player would fail to load. A suite that needs different behaviour
 * overrides this with its own jest.mock factory.
 */
export interface YoutubeIframeRef {
  getCurrentTime: () => Promise<number>;
  getDuration: () => Promise<number>;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
}

const MockPlayer = forwardRef<YoutubeIframeRef, object>((_props, ref) => {
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => Promise.resolve(0),
    getDuration: () => Promise.resolve(600),
    seekTo: () => undefined,
  }));
  return null;
});
MockPlayer.displayName = "MockYoutubePlayer";

export default MockPlayer;
