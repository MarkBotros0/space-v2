import { ScrollView } from "react-native";
import type { SeasonListItem } from "@space/shared";

import { useTheme } from "../theme";
import { Button } from "../ui";

export interface SeasonSwitcherProps {
  seasons: SeasonListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/** Horizontal season chips. Renders nothing when there is only one season to show. */
export function SeasonSwitcher({ seasons, selectedId, onSelect }: SeasonSwitcherProps) {
  const theme = useTheme();
  if (seasons.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}
    >
      {seasons.map((s) => (
        <Button
          key={s.id}
          title={s.title}
          variant={s.id === selectedId ? "primary" : "secondary"}
          onPress={() => onSelect(s.id)}
        />
      ))}
    </ScrollView>
  );
}
