import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "../ui/text";

/** In-content page header (title, description, actions) on the type scale: `title` + `subhead`. */
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
        <Text accessibilityRole="header" variant="title">
          {title}
        </Text>
        {description ? (
          <Text variant="subhead" className="text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {actions ? <View className="shrink-0 flex-row flex-wrap items-center gap-2">{actions}</View> : null}
    </View>
  );
}
