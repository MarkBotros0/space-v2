import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

/** Prominent card for the one thing that matters now: eyebrow, title, meta, optional action (a Button). */
function HeroCard({
  eyebrow, title, meta, action, className,
}: { eyebrow: string; title: string; meta?: string; action?: ReactNode; className?: string }) {
  return (
    <View className={cn("gap-1 rounded-2xl bg-surface p-5", className)}>
      <Text variant="caption" className="font-medium uppercase tracking-wide text-muted-foreground">
        {eyebrow}
      </Text>
      <Text variant="title" numberOfLines={2}>
        {title}
      </Text>
      {meta ? (
        <Text variant="subhead" className="text-muted-foreground">
          {meta}
        </Text>
      ) : null}
      {action ? <View className="mt-3 flex-row flex-wrap gap-2">{action}</View> : null}
    </View>
  );
}

export { HeroCard };
