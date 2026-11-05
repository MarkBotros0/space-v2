/**
 * Legacy Card, kept so its call sites compile, drawn as a redesign group:
 * `surface`, radius 16, no shadow (flat cards; the page tint separates them in
 * light), and a `separator` hairline in dark, where surface-on-surface (a card
 * in a sheet) would otherwise vanish. A pressable card takes the spring press
 * scale like ListRow: the Pressable is bare, the Animated.View carries only
 * the scale, and the look sits on a plain View inside (classes never go on an
 * Animated.* — no-classname-on-animated.test.ts). Titles use the type scale.
 * Plans 02–05 move the call sites to GroupedList / HeroCard and delete this.
 */
import type { ReactNode } from "react";
import { Pressable, View, type ViewProps } from "react-native";
import Animated from "react-native-reanimated";

import { usePressScale } from "../motion";
import { cn } from "../lib/cn";
import { Text } from "./text";

type Box = ViewProps & { className?: string; children?: ReactNode };

const CARD = "rounded-group bg-surface dark:border dark:border-separator";

function PressableCard({ className, onPress, ...props }: Box & { onPress?: () => void }) {
  const press = usePressScale(0.985);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} onPressIn={press.onPressIn} onPressOut={press.onPressOut}>
      <Animated.View style={press.animatedStyle}>
        <View className={cn(CARD, className)} {...props} />
      </Animated.View>
    </Pressable>
  );
}

function Card({ className, interactive, onPress, ...props }: Box & { interactive?: boolean; onPress?: () => void }) {
  if (interactive || onPress) return <PressableCard className={className} onPress={onPress} {...props} />;
  return <View className={cn(CARD, className)} {...props} />;
}

function CardHeader({ className, ...props }: Box) {
  return <View className={cn("flex-col gap-1.5 p-4", className)} {...props} />;
}

function CardTitle({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text variant="headline" accessibilityRole="header" className={className}>
      {children}
    </Text>
  );
}

function CardDescription({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text variant="subhead" className={cn("text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

function CardContent({ className, ...props }: Box) {
  return <View className={cn("p-4 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: Box) {
  return <View className={cn("flex-row items-center gap-2 border-t border-separator p-4", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
