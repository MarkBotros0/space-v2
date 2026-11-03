import { Pressable, ScrollView } from "react-native";

import { cn } from "../../design/lib/cn";
import { Text } from "../../design/ui";

/** V2-ONLY: v1 scoped each report page to one season by URL; v2 filters in place. */
export function SeasonPicker({
  seasons,
  selected,
  onSelect,
}: {
  seasons: Array<{ id: number; title: string }>;
  selected: number | null;
  onSelect: (id: number | null) => void;
}) {
  const options: Array<{ id: number | null; title: string }> = [
    { id: null, title: "All seasons" },
    ...seasons,
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((o) => {
        const active = selected === o.id;
        return (
          <Pressable
            key={o.id ?? "all"}
            accessibilityRole="button"
            accessibilityLabel={`Season filter: ${o.title}`}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(o.id)}
            className={cn(
              "rounded-lg border px-3 py-2",
              active
                ? "border-brand-teal-500 bg-brand-teal-50 dark:bg-brand-teal-950"
                : "border-border bg-card",
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
