import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { ChoiceChip } from "../../design/ui/choice-chip";
import { SegmentedControl } from "../../design/ui/segmented-control";
import { SearchField } from "../../design/ui/search-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../design/ui/select";
import { ANY_SEASON, type PeopleFilters, type Pool } from "./model";

/** Search, the "Last season" choice, the "Available" chip and Select all, over the fetched list. */
export function PeopleFilterBar({
  filters,
  onChange,
  titles,
  allTicked,
  targetCount,
  onSelectAll,
  pool,
  onPool,
}: {
  filters: PeopleFilters;
  onChange: (next: PeopleFilters) => void;
  titles: string[];
  /** Every visible available row is already ticked. */
  allTicked: boolean;
  /** Available rows matching the filters, across both tabs. */
  targetCount: number;
  onSelectAll: () => void;
  /** The tab, or null when the season has only students and shows none. */
  pool: Pool | null;
  onPool: (pool: Pool) => void;
}) {
  const items = [
    { value: ANY_SEASON, label: "Last season: Any" },
    ...titles.map((t) => ({ value: t, label: `Last season: ${t}` })),
  ];
  return (
    <View className="gap-3 pb-3">
      {pool ? (
        <SegmentedControl
          options={[
            { value: "student", label: "Students" },
            { value: "alumni", label: "Alumni" },
          ]}
          value={pool}
          onChange={(v) => onPool(v as Pool)}
        />
      ) : null}
      <SearchField
        value={filters.query}
        onChangeText={(query) => onChange({ ...filters, query })}
        placeholder="Search"
        accessibilityLabel="Search people"
      />
      <View className="flex-row flex-wrap items-center gap-2">
        <View className="min-w-[200px] shrink">
          <Select
            items={items}
            value={filters.lastSeason}
            onValueChange={(lastSeason) => onChange({ ...filters, lastSeason })}
          >
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
      <Button variant="secondary" onPress={onSelectAll} disabled={targetCount === 0} className="self-start">
        {allTicked ? "Clear available" : `Select all available (${targetCount})`}
      </Button>
    </View>
  );
}
