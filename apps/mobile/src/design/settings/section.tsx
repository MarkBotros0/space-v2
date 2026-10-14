/**
 * v1 components/settings/settings-form.tsx's local Section: a soft card with a
 * teal icon box, title and description, then the section's body.
 * md:p-6 dropped.
 */
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Text } from "../ui/text";

export function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  iconWithClassName(Icon);
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
      <View className="mb-4 flex-row items-start gap-3">
        <View className="size-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal-100 dark:bg-brand-teal-950">
          <Icon size={16} className="text-brand-teal-700 dark:text-brand-teal-300" />
        </View>
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground">{description}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}
