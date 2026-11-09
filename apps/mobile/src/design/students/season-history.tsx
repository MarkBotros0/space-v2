/**
 * Student history on grouped rows: one GroupedList per season, with the
 * attendance % (neutral tone, never red) and a collapsed curriculum. Only
 * /history renders it. The rows are the alumni screen's `SeasonGroup`, so both
 * read the same.
 * Privacy-critical (spec 02 R34): rows carry attendance % and curriculum only.
 */
import { View } from "react-native";
import type { SeasonHistoryRow } from "@space/shared";

import { SeasonGroup } from "../../screens/alumni/alumni-history";
import { NAV_ICONS } from "../icons/nav-icon";
import { EmptyState } from "../ui/empty-state";

export function SeasonHistory({ rows, emptyDescription }: { rows: SeasonHistoryRow[]; emptyDescription: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={NAV_ICONS.season} title="No past seasons" description={emptyDescription} />;
  }
  return (
    <View className="flex-col gap-3">
      {rows.map((row) => (
        <SeasonGroup key={row.seasonId} row={row} />
      ))}
    </View>
  );
}
