/**
 * v1 app/leader/dashboard/page.tsx card shell, used by "Your students",
 * "Assignments" and "Quiz corrections" (and the admin dashboard in batch 4):
 * a border-b header row with a teal icon, bold title and a "View all" link,
 * then the body with no padding of its own. FigurePair is the two-column
 * figure grid those cards hold (`grid grid-cols-2 divide-x divide-border`).
 */
import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Text } from "../ui/text";

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
    <View className="rounded-2xl border border-border bg-card" style={shadowStyle("soft")}>
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-3">
        <Icon size={16} className="text-brand-teal-600" />
        <Text className="text-sm font-bold text-brand-navy-900 dark:text-foreground">{title}</Text>
        {onViewAll ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View all ${title}`}
            onPress={onViewAll}
            className="ml-auto"
          >
            <Text className="text-xs font-semibold text-brand-teal-700 dark:text-brand-teal-300">View all</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export interface Figure {
  label: string;
  value: number | string;
  /** v1 accent class for the value, e.g. `text-warning-700 dark:text-warning-300`. */
  accent: string;
}

export function FigurePair({ items }: { items: [Figure, Figure] }) {
  return (
    <View className="flex-row">
      {items.map((f, i) => (
        <View key={f.label} className={cn("flex-1 items-center px-4 py-3", i > 0 && "border-l border-border")}>
          <Text className={cn("text-2xl font-black", f.accent)}>{String(f.value)}</Text>
          <Text className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {f.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
