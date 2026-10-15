/**
 * v1 student-form.tsx Section: `fieldset.rounded-lg border border-border
 * bg-card p-4` with its `legend.px-1 text-sm font-semibold` sitting on the top
 * border. React Native has no fieldset, so the legend is positioned over the
 * border with a bg-card patch behind it.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "../ui/text";

export function Fieldset({ legend, children }: { legend: string; children?: ReactNode }) {
  return (
    <View className="rounded-lg border border-border bg-card p-4">
      <View className="absolute -top-2.5 left-3 bg-card px-1">
        <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
          {legend}
        </Text>
      </View>
      <View className="mt-2 flex-col gap-4">{children}</View>
    </View>
  );
}
