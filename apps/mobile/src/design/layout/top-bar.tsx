/**
 * Port of v1 src/components/layout/top-bar.tsx, phone branch: logo with
 * wordmark on the left, notification bell and user menu on the right
 * (v1's search, role badge, help and divider are md:/lg: only).
 * Native differences: .jpc-glass (card at 78% over a 12px backdrop blur) →
 * BlurView under bg-card/78; sticky top-0 → rendered above the scroll view,
 * with the status-bar inset added on top of v1's h-16.
 */
import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Logo } from "../ui/logo";

export function TopBar({ right }: { right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="z-30 border-b border-border/60" style={{ paddingTop: insets.top }}>
      <BlurView intensity={30} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
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
