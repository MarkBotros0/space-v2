/**
 * Port of v1 src/components/layout/top-bar.tsx, phone branch: logo with
 * wordmark on the left, notification bell and user menu on the right
 * (v1's search, role badge, help and divider are md:/lg: only).
 * Native differences: .jpc-glass is card at 78% over a 12px blur of the page
 * scrolling beneath it. Here the bar is the navigator's header, so nothing
 * scrolls under it: it is drawn as card/78 over the page background (what
 * v1 shows at the top of a page). The status-bar inset sits on top of h-16.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "../ui/logo";

export function TopBar({ right }: { right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    // bg-background sits on the bordered view itself: absolute layers stop at
    // the padding box, and the navigator's light-grey scene colour showed
    // through the translucent border as a bright line in dark mode.
    <View className="z-30 border-b border-border/60 bg-background" style={{ paddingTop: insets.top }}>
      <View className="absolute inset-0 bg-card/78" />
      <View className="h-16 flex-row items-center gap-3 px-4">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <Logo size="sm" showWordmark className="shrink-0" />
        </View>
        <View className="flex-row items-center gap-1">{right}</View>
      </View>
    </View>
  );
}
