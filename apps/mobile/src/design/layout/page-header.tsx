import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "../ui/text";

/** v1 page-header.tsx at phone width (md: classes dropped). */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <View className={cn("flex-col gap-1 pb-4", className)}>
      <View className="flex-col gap-1">
        <Text accessibilityRole="header" className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </Text>
        {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
      </View>
      {actions ? <View className="shrink-0 flex-row items-center gap-2">{actions}</View> : null}
    </View>
  );
}
