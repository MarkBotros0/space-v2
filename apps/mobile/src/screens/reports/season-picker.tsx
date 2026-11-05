import { ScrollView } from "react-native";

import { ChoiceChip } from "../../design/ui";

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
      {options.map((o) => (
        <ChoiceChip
          key={o.id ?? "all"}
          label={o.title}
          accessibilityLabel={`Season filter: ${o.title}`}
          selected={selected === o.id}
          onPress={() => onSelect(o.id)}
        />
      ))}
    </ScrollView>
  );
}
