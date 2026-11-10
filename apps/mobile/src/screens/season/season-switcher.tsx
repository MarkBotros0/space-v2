import { Pressable, ScrollView } from "react-native";
import type { SeasonListItem } from "@space/shared";

import { cn } from "../../design/lib/cn";
import { Text } from "../../design/ui";

interface SeasonSwitcherProps {
  seasons: SeasonListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * Horizontal season chips (V2-ONLY: v1 redirected an admin to one season, R86),
 * drawn like v1's session-type toggle. Renders nothing when there is only one
 * season to show.
 */
export function SeasonSwitcher({ seasons, selectedId, onSelect }: SeasonSwitcherProps) {
  if (seasons.length < 2) return null;
  return (
    <ScrollView
      testID="season-switcher"
      horizontal
      // A horizontal ScrollView defaults to flexGrow 1: inside a growing
      // content container it stretched every chip to fill the spare height.
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
    >
      {seasons.map((s) => {
        const selected = s.id === selectedId;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(s.id)}
            className={cn(
              "min-h-[44px] justify-center rounded-full border px-3",
              selected ? "border-ring bg-accent" : "border-control-border bg-surface",
            )}
          >
            <Text
              className={cn(
                "text-sm font-semibold",
                selected ? "text-brand-teal-800 dark:text-brand-teal-200" : "text-muted-foreground",
              )}
            >
              {s.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
