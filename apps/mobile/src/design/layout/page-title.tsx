/**
 * v1's student pages hand-roll their header instead of using PageHeader:
 * h1 `text-2xl font-black text-brand-navy-900 dark:text-foreground` (detail
 * pages `text-xl`), subtitle `mt-1 text-sm text-muted-foreground`, eyebrows
 * `text-[10px] font-bold uppercase tracking-widest …`, back links
 * `text-xs font-semibold text-brand-teal-700 … ← Label`.
 */
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "../ui/text";

export function PageTitle({
  title,
  subtitle,
  size = "page",
  className,
}: {
  title: string;
  subtitle?: string;
  size?: "page" | "detail";
  className?: string;
}) {
  return (
    <View className={className}>
      <Text
        accessibilityRole="header"
        className={cn(size === "page" ? "text-2xl" : "text-xl", "font-black text-brand-navy-900 dark:text-foreground")}
      >
        {title}
      </Text>
      {subtitle ? <Text className="mt-1 text-sm text-muted-foreground">{subtitle}</Text> : null}
    </View>
  );
}

export function Eyebrow({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "teal";
  className?: string;
}) {
  return (
    <Text
      className={cn(
        "text-[10px] font-bold uppercase tracking-widest",
        tone === "muted" ? "text-muted-foreground/70" : "text-brand-teal-700 dark:text-brand-teal-300",
        className,
      )}
    >
      {children}
    </Text>
  );
}

export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="self-start">
      <Text className="text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300">← {label}</Text>
    </Pressable>
  );
}
