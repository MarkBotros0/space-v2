import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

type HeroTone = "surface" | "brand";

/**
 * Prominent card for the one thing that matters now: eyebrow, title, meta, optional action (a Button).
 * `tone="brand"` is the navy hero (navy in light, navy-700 in dark); its action is a Button `onHero`.
 */
function HeroCard({
  eyebrow, title, meta, action, className, tone = "surface",
}: { eyebrow: string; title: string; meta?: string; action?: ReactNode; className?: string; tone?: HeroTone }) {
  const brand = tone === "brand";
  return (
    <View testID="hero-card" className={cn("gap-1 rounded-group p-5", brand ? "bg-hero" : "bg-surface", className)}>
      <Text
        variant="caption"
        className={cn("font-medium uppercase tracking-wide", brand ? "text-hero-eyebrow" : "text-muted-foreground")}
      >
        {eyebrow}
      </Text>
      <Text variant="title" numberOfLines={2} className={brand ? "text-hero-foreground" : undefined}>
        {title}
      </Text>
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
