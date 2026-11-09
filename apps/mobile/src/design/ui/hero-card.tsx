import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Text } from "./text";

iconWithClassName(ChevronRight);

type HeroTone = "surface" | "brand";

/**
 * Prominent card for the one thing that matters now: eyebrow, title, meta, optional action (a Button).
 * `tone="brand"` is the brand hero: a soft navy tint with navy text in light (a solid navy block outweighed
 * every other card, owner 2026-11-09), navy-700 in dark; its action is a Button `onHero` (navy in light).
 * The brand hero shows a long title in full (a clamp cut real session titles mid-word at font 1.3);
 * the default tone clamps at two lines.
 * `onTitlePress` makes the title a link to the thing it names, with a chevron; the action stays its own control.
 */
function HeroCard({
  eyebrow, title, meta, action, className, tone = "surface", onTitlePress,
}: {
  eyebrow: string;
  title: string;
  meta?: string;
  action?: ReactNode;
  className?: string;
  tone?: HeroTone;
  onTitlePress?: () => void;
}) {
  const brand = tone === "brand";
  const titleText = (
    <Text variant="title" numberOfLines={brand ? undefined : 2} className={cn(onTitlePress && "min-w-0 flex-1", brand && "text-hero-foreground")}>
      {title}
    </Text>
  );
  return (
    <View testID="hero-card" className={cn("gap-1 rounded-group p-5", brand ? "bg-hero" : "bg-surface", className)}>
      <Text
        variant="caption"
        className={cn("font-medium uppercase tracking-wide", brand ? "text-hero-eyebrow" : "text-muted-foreground")}
      >
        {eyebrow}
      </Text>
      {onTitlePress ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={title}
          onPress={onTitlePress}
          className="min-h-[44px] flex-row items-center gap-1"
        >
          {titleText}
          <ChevronRight size={20} className={cn("shrink-0", brand ? "text-hero-foreground" : "text-muted-foreground")} />
        </Pressable>
      ) : (
        titleText
      )}
      {meta ? (
        <Text variant="subhead" className={brand ? "text-hero-muted" : "text-muted-foreground"}>
          {meta}
        </Text>
      ) : null}
      {action ? <View className="mt-3 flex-row flex-wrap gap-2">{action}</View> : null}
    </View>
  );
}

export { HeroCard };
export type { HeroTone };
