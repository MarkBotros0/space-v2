/**
 * A list's search box with its Filter icon button beside it, one row (owner, 2026-11-07: Filter
 * is an icon in the search row, never a chip under it). Shared by the student lists and Community
 * (refactor FE-029).
 */
import { View } from "react-native";

import { FilterButton } from "./filter-button";
import { SearchField } from "./search-field";

export function SearchFilterRow({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmitEditing,
  activeFilters,
  onFilter,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  /** Defaults to the placeholder. */
  accessibilityLabel?: string;
  /** Keyboard search pressed. */
  onSubmitEditing?: () => void;
  /** How many filters are on; the button says so. */
  activeFilters: number;
  onFilter: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <SearchField
        accessibilityLabel={accessibilityLabel}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onSubmitEditing={onSubmitEditing}
        className="min-w-0 flex-1"
      />
      <FilterButton active={activeFilters} onPress={onFilter} />
    </View>
  );
}
