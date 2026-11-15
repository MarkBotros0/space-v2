/**
 * The YouTube frame's links (its logo, the video title) go to the app first, so the student is told
 * that watching in YouTube doesn't count before it opens (owner, 2026-11-15). The frame's own page and
 * the embed inside it load as before (react-native-youtube-iframe 2.4.1 `onShouldStartLoadWithRequest`,
 * which `webViewProps` replaces).
 */
import { Alert, Linking, Platform } from "react-native";
import type { WebViewProps } from "react-native-webview";

import { isYouTubeLink } from "./player-model";

/** react-native-youtube-iframe's DEFAULT_BASE_URL, passed as its `baseUrlOverride` so the two stay one. */
export const PLAYER_BASE_URL = "https://lonelycpp.github.io/react-native-youtube-iframe/iframe_v2.html";

/** "Open YouTube?" with the warning; Open goes to YouTube, Stay keeps the student here. */
export function confirmOpenYouTube(url: string, message: string, onOpen?: () => void): void {
  Alert.alert("Open YouTube?", message, [
    { text: "Stay here", style: "cancel" },
    {
      text: "Open YouTube",
      onPress: () => {
        onOpen?.();
        void Linking.openURL(url).catch(() => undefined);
      },
    },
  ]);
}

/** The frame's webview props: its own page loads, a YouTube link calls `onYouTubeLink` instead. */
export function youTubeLinkGuard(onYouTubeLink: (url: string) => void): WebViewProps {
  return {
    onShouldStartLoadWithRequest: (request) => {
      // An iframe's own load (the embed) is the player itself.
      if (request.isTopFrame === false) return true;
      const url = request.mainDocumentURL || request.url;
      if (Platform.OS === "ios" && url === "about:blank") return true;
      if (url.startsWith(PLAYER_BASE_URL)) return true;
      if (isYouTubeLink(url)) onYouTubeLink(url);
      return false;
    },
    onOpenWindow: (event) => {
      const url = event.nativeEvent.targetUrl;
      if (isYouTubeLink(url)) onYouTubeLink(url);
    },
  };
}
