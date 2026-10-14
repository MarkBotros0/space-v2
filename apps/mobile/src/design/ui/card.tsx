/**
 * Port of v1 src/components/ui/card.tsx.
 * Native differences: ring-1 ring-border → border border-border; md: padding
 * dropped (p-4 kept); interactive hover lift → active:opacity-90. Text colour
 * comes from Text's base (v1 inherits body text-foreground).
 */
import type { ReactNode } from "react";
import { Pressable, View, type ViewProps } from "react-native";

import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Text } from "./text";

type Box = ViewProps & { className?: string; children?: ReactNode };

function Card({ className, interactive, onPress, ...props }: Box & { interactive?: boolean; onPress?: () => void }) {
  const base = cn("rounded-2xl border border-border bg-card", className);
  if (interactive || onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className={cn(base, "active:opacity-90")}
        style={shadowStyle("soft")}
        {...props}
      />
    );
  }
  return <View className={base} style={shadowStyle("soft")} {...props} />;
}

function CardHeader({ className, ...props }: Box) {
  return <View className={cn("flex-col gap-1.5 p-4", className)} {...props} />;
}

function CardTitle({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <Text accessibilityRole="header" className={cn("text-base font-semibold leading-tight tracking-tight", className)}>
      {children}
    </Text>
  );
}

function CardDescription({ className, children }: { className?: string; children?: ReactNode }) {
  return <Text className={cn("text-sm text-muted-foreground", className)}>{children}</Text>;
}

function CardContent({ className, ...props }: Box) {
  return <View className={cn("p-4 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: Box) {
  return <View className={cn("flex-row items-center gap-2 border-t border-border p-4", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
