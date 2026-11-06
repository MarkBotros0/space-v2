import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { ChoiceChip } from "../../design/ui/choice-chip";
import { SearchField } from "../../design/ui/search-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../design/ui/select";
import { ANY_SEASON, type PeopleFilters } from "./model";

/** Search, the "Last season" choice, the "Available" chip and Select all, over the fetched list. */
export function PeopleFilterBar({
  filters,
  onChange,
  titles,
  allTicked,
  hasTargets,
  onSelectAll,
}: {
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  titles: string[];
  /** Every visible available row is already ticked. */
  allTicked: boolean;
  hasTargets: boolean;
  onSelectAll: () => void;
}) {
  const items = [
    { value: ANY_SEASON, label: "Last season: Any" },
    ...titles.map((t) => ({ value: t, label: `Last season: ${t}` })),
  ];
  return (
    <View className="gap-3 pb-3">
      <SearchField
        value={filters.query}
        onChangeText={(query) => onChange({ ...filters, query })}
        placeholder="Search"
        accessibilityLabel="Search people"
      />
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="min-w-[200px] shrink">
          <Select items={items} value={filters.lastSeason} onValueChange={(lastSeason) => onChange({ ...filters, lastSeason })}>
            <SelectTrigger accessibilityLabel="Last season">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </View>
        <ChoiceChip
          label="Available"
          selected={filters.availableOnly}
          onPress={() => onChange({ ...filters, availableOnly: !filters.availableOnly })}
        />
      </View>
      <Button variant="secondary" onPress={onSelectAll} disabled={!hasTargets} className="self-start">
        {allTicked ? "Clear available" : "Select all available"}
      </Button>
    </View>
  );
}
