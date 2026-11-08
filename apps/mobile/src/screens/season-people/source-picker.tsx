import { View } from "react-native";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../design/ui/select";
import { Text } from "../../design/ui/text";
import { sourceBanner, type SourceSeason } from "./source";

const NONE = "none";

/**
 * "Add the people who passed": a finished season whose passers are ticked
 * (owner, 2026-11-07). Most seasons start with everyone who passed the last
 * one; the admin may pick another, or none.
 */
export function SourcePicker({
  sources,
  value,
  ticked,
  onChange,
}: {
  sources: SourceSeason[];
  value: SourceSeason | null;
  /** How many of its passers choosing it ticked. */
  ticked: number;
  onChange: (id: number | null) => void;
}) {
  if (sources.length === 0) return null;
  const items = [
    { value: NONE, label: "No season" },
    ...sources.map((s) => ({ value: String(s.id), label: s.title })),
  ];
  return (
    <View className="gap-2 rounded-control bg-info-soft p-3">
      <Text variant="subhead" className="font-semibold text-foreground">
        Add the people who passed
      </Text>
      <Select
        items={items}
        value={value ? String(value.id) : NONE}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger accessibilityLabel="Add the people who passed">
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
      <Text variant="subhead" className="text-foreground">
        {value
          ? sourceBanner(value, ticked)
          : "Most seasons start with everyone who passed the last one. Pick a season to tick its passers."}
      </Text>
    </View>
  );
}
