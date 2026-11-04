/**
 * In-content page title for screens the role batches have not rebuilt yet
 * (rebuilt screens take their title from Screen's LargeTitle): a page title
 * is the `largeTitle` variant, a detail title `title`, the subtitle `subhead`
 * in muted foreground. Eyebrow is the section-header caption (uppercase,
 * medium, wide tracking), muted or teal. Navigation back is Screen's pinned
 * back bar, never an in-content link.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

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
      <Text accessibilityRole="header" variant={size === "page" ? "largeTitle" : "title"}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="subhead" className="mt-1 text-muted-foreground">
          {subtitle}
        </Text>
      ) : null}
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
      variant="caption"
      className={cn(
        "font-medium uppercase tracking-wide",
        tone === "muted" ? "text-muted-foreground" : "text-brand-teal-800 dark:text-brand-teal-300",
        className,
      )}
    >
      {children}
    </Text>
  );
}
