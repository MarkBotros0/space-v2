/** Layout helpers shared by the design-system showcase's sections. */
import type { ReactNode } from "react";
import { Text as RNText, useWindowDimensions, View } from "react-native";

import { Text } from "../../design/ui";

export function Section({
  title,
  subtitle,
  first,
  children,
}: {
  title: string;
  subtitle?: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <View className={first ? "py-6" : "border-t border-border py-6"}>
      <View className="mb-4 flex-col gap-0.5">
        <Text accessibilityRole="header" className="text-lg font-semibold text-foreground">
          {title}
        </Text>
        {subtitle ? <Text className="text-sm text-muted-foreground">{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** grid-cols-N with gap: phone-width columns computed from the content width. */
export function Grid({ cols, gap, children }: { cols: number; gap: number; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const cell = (width - 32 - gap * (cols - 1)) / cols;
  return (
    <View className="flex-row flex-wrap" style={{ gap }}>
      {Array.isArray(children)
        ? children.map((c, i) => (
            <View key={i} style={{ width: cell }}>
              {c}
            </View>
          ))
        : children}
    </View>
  );
}

/** v1's inline <code>: inherits the surrounding colour (nested text does too). */
export function Code({ children }: { children: string }) {
  return (
    <RNText className="bg-muted text-xs" style={{ fontFamily: "GeistMono_400Regular" }}>
      {children}
    </RNText>
  );
}
