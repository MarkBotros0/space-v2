/**
 * Port of v1 src/components/ui/empty-state.tsx.
 * Native differences: bg-gradient-to-br → expo-linear-gradient with the same
 * stops (light teal-100→teal-200, dark teal-900→navy-900); the blur-xl glow
 * behind the icon is a soft larger circle at the same colour/opacity
 * (no native blur filter); ring-inset → border; md:py-16 dropped.
 */
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { ReactNode } from "react";
import { View } from "react-native";

import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Text } from "./text";

const { colors } = require("../theme/tailwind-theme.js") as {
  colors: Record<"brand-teal" | "brand-navy", Record<string, string>>;
};
const LIGHT_STOPS: [string, string] = [colors["brand-teal"]["100"]!, colors["brand-teal"]["200"]!];
const DARK_STOPS: [string, string] = [colors["brand-teal"]["900"]!, colors["brand-navy"]["900"]!];

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  if (Icon) iconWithClassName(Icon);
  const stops = dark ? DARK_STOPS : LIGHT_STOPS;
  return (
    <View
      className={cn(
        "flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12",
        className,
      )}
    >
      {Icon ? (
        <View className="relative items-center justify-center">
          <View className="absolute -inset-3 rounded-full bg-brand-teal-200/40 dark:bg-brand-teal-900/60" />
          <LinearGradient
            colors={stops}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 56, height: 56, borderRadius: 9999, alignItems: "center", justifyContent: "center" }}
          >
            <View className="absolute inset-0 rounded-full border border-brand-teal-300/60 dark:border-brand-teal-800/60" />
            <Icon size={24} className="text-brand-navy-900 dark:text-brand-teal-200" />
          </LinearGradient>
        </View>
      ) : null}
      <View className="max-w-md flex-col items-center gap-1.5">
        <Text className="text-center text-lg font-semibold tracking-tight text-foreground">{title}</Text>
        {description ? <Text className="text-center text-sm text-muted-foreground">{description}</Text> : null}
      </View>
      {action ? <View className="mt-1">{action}</View> : null}
    </View>
  );
}

export { EmptyState };
