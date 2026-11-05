import { Pressable, ScrollView } from "react-native";

import { cn } from "../../design/lib/cn";
import { ChoiceChip, Text } from "../../design/ui";

/**
 * V2-ONLY: v1 scoped each report page to one season by URL; v2 filters in place.
 * `chips` (admin and super) draws the kit's ChoiceChip; the default is the
 * mentor's original pill.
 */
export function SeasonPicker({
  seasons,
  selected,
  onSelect,
  chips = false,
}: {
  seasons: Array<{ id: number; title: string }>;
  selected: number | null;
  onSelect: (id: number | null) => void;
  chips?: boolean;
}) {
  const options: Array<{ id: number | null; title: string }> = [
    { id: null, title: "All seasons" },
    ...seasons,
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((o) => {
        const active = selected === o.id;
        const label = `Season filter: ${o.title}`;
        if (chips) {
          return (
            <ChoiceChip
              key={o.id ?? "all"}
              label={o.title}
              accessibilityLabel={label}
              selected={active}
              onPress={() => onSelect(o.id)}
            />
          );
        }
        return (
          <Pressable
            key={o.id ?? "all"}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(o.id)}
            className={cn(
              "rounded-full border px-3 py-2",
              active
                ? "border-ring bg-accent"
                : "border-control-border bg-surface",
            )}
          >
            <Text
              className={cn(
                "text-sm font-semibold",
                active ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-muted-foreground",
              )}
            >
              {o.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
