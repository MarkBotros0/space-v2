/**
 * The whole-app "no internet" screen (owner, 2026-11-08). It covers every
 * screen while the device has no connection and leaves by itself when the
 * connection comes back (React Query then refetches what was paused,
 * src/lib/online.ts). Try again asks NetInfo to look again at once rather
 * than waiting for its next event.
 *
 * A drop shorter than SHOW_AFTER_MS never shows it, so a lift or a tunnel
 * doesn't flash a full screen. No animation: it appears and leaves at once
 * (motion rules in CLAUDE.md).
 */
import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { WifiOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isOnlineState, useIsOnline } from "../../lib/online";
import { iconWithClassName } from "../lib/icon";
import { Button } from "../ui/button";
import { Text } from "../ui/text";

iconWithClassName(WifiOff);

/** How long the device must stay offline before the screen shows. */
export const SHOW_AFTER_MS = 1500;

/** Offline for at least SHOW_AFTER_MS; back to false the moment it reconnects. */
function useOfflineForAWhile(): boolean {
  const online = useIsOnline();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (online) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [online]);
  return shown;
}

export function OfflineScreen() {
  const shown = useOfflineForAWhile();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(false);
  const [stillOffline, setStillOffline] = useState(false);

  useEffect(() => {
    if (!shown) setStillOffline(false);
  }, [shown]);

  if (!shown) return null;

  const retry = () => {
    setChecking(true);
    setStillOffline(false);
    void NetInfo.refresh()
      .then((state) => {
        if (isOnlineState(state)) onlineManager.setOnline(true);
        else setStillOffline(true);
      })
      .catch(() => setStillOffline(true))
      .finally(() => setChecking(false));
  };

  return (
    <View
      testID="offline-screen"
      accessibilityViewIsModal
      className="absolute inset-0 items-center justify-center bg-background px-8"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="w-full max-w-[360px] items-center gap-4">
        <View className="size-20 items-center justify-center rounded-full bg-neutral-soft">
          <WifiOff size={36} className="text-muted-foreground" />
        </View>
        <View className="items-center gap-2">
          <Text variant="title" accessibilityRole="header" className="text-center">
            {"You're offline"}
          </Text>
          <Text variant="body" className="text-center text-muted-foreground">
            JPC Space needs an internet connection. Check your Wi-Fi or mobile data, then try again.
          </Text>
        </View>
        <Button className="mt-2 self-stretch" loading={checking} onPress={retry}>
          Try again
        </Button>
        {/* Always mounted so the live region is announced when the words change. */}
        <Text
          variant="subhead"
          accessibilityLiveRegion="polite"
          className="min-h-[20px] text-center text-muted-foreground"
        >
          {stillOffline ? "Still no connection. This screen closes by itself once you're back online." : ""}
        </Text>
      </View>
    </View>
  );
}
