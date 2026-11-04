/**
 * Dashboard card shell ("Your students", "Assignments", "Quiz corrections",
 * the admin dashboard), drawn as a redesign group: `surface`, radius 16, no
 * shadow, a `separator` hairline under the header row (teal icon, subhead
 * title, a "View all" link with the press scale), then the body with no
 * padding of its own. FigurePair is the two-column figure grid those cards
 * hold, values on the title size with tabular numerals.
 */
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { usePressScale } from "../motion";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Text } from "../ui/text";

function ViewAll({ title, onPress }: { title: string; onPress: () => void }) {
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`View all ${title}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      hitSlop={8}
      className="ml-auto"
    >
      <Animated.View style={press.animatedStyle}>
        <Text variant="subhead" className="font-medium text-brand-teal-800 dark:text-brand-teal-300">
          View all
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function SectionCard({
  icon: Icon,
  title,
  onViewAll,
  children,
}: {
  icon: LucideIcon;
  title: string;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  iconWithClassName(Icon);
  return (
    <View className="overflow-hidden rounded-[16px] bg-surface dark:border dark:border-separator">
      <View className="min-h-[44px] flex-row items-center gap-2 border-b border-separator px-4 py-2">
        <Icon size={16} className="text-brand-teal-800 dark:text-brand-teal-300" />
        <Text variant="subhead" className="min-w-0 flex-1 font-semibold">
          {title}
        </Text>
        {onViewAll ? <ViewAll title={title} onPress={onViewAll} /> : null}
      </View>
      {children}
    </View>
  );
}

export interface Figure {
  label: string;
  value: number | string;
  /** Accent class for the value, e.g. `text-warning-700 dark:text-warning-300`. */
  accent: string;
}

export function FigurePair({ items }: { items: [Figure, Figure] }) {
  return (
    <View className="flex-row">
      {items.map((f, i) => (
        <View key={f.label} className={cn("flex-1 items-center px-4 py-3", i > 0 && "border-l border-separator")}>
          <Text variant="title" tabular className={cn("font-bold", f.accent)}>
            {String(f.value)}
          </Text>
          <Text
            variant="caption"
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
            className="mt-0.5 text-center font-medium uppercase tracking-wide text-muted-foreground"
          >
            {f.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
