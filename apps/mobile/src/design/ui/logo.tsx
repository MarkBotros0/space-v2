/**
 * Port of v1 src/components/ui/logo.tsx — same asset (public/jpc-logo.jpg,
 * copied to assets/), same sizes.
 * Native differences: ring-1 ring-white/10 → border border-white/10.
 */
import { Image, View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

const SIZES = {
  sm: { px: 28, box: "size-7", wordmark: "text-base" },
  md: { px: 36, box: "size-9", wordmark: "text-lg" },
  lg: { px: 64, box: "size-16", wordmark: "text-2xl" },
} as const;

const LOGO = require("../../../assets/jpc-logo.jpg");

export function Logo({
  size = "md",
  showWordmark = false,
  className,
  wordmarkClassName,
}: {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}) {
  const dims = SIZES[size];
  return (
    <View className={cn("flex-row items-center gap-2.5", className)}>
      <View className={cn("relative shrink-0 overflow-hidden rounded-xl border border-white/10", dims.box)}>
        <Image
          source={LOGO}
          accessibilityLabel={showWordmark ? "JPC Space logo" : "JPC Space"}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </View>
      {showWordmark ? (
        <Text className={cn("font-semibold tracking-tight", dims.wordmark, wordmarkClassName)}>JPC Space</Text>
      ) : null}
    </View>
  );
}
