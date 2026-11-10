/**
 * Seasons grouped by program (A-Z, newest year first): one GroupedList per
 * program, a row per season with its code and dates beneath the title, its
 * status as a chip and a chevron that opens it. Editing a season lives on the
 * season detail ("Edit season"), not on the row.
 */
import type { SeasonListItem } from "@space/shared";
import { Calendar as CalendarIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";

import { formatSeasonDay, keepTogether } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, statusChip } from "../../design/ui/status-chip";

export function SeasonsList({
  rows,
  onOpen,
  emptyTitle = "No seasons yet",
  emptyDescription = "Create your first season to get started.",
  emptyAction,
}: {
  rows: SeasonListItem[];
  onOpen: (row: SeasonListItem) => void;
  emptyAction?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  const programs = new Map<string, SeasonListItem[]>();
  for (const row of rows) {
    const list = programs.get(row.program) ?? [];
    list.push(row);
    programs.set(row.program, list);
  }
  const groups = [...programs.entries()]
    .map(([program, seasons]) => ({
      program,
      seasons: [...seasons].sort((a, b) => b.year - a.year),
    }))
    .sort((a, b) => a.program.localeCompare(b.program));

  return (
    <View className="flex-col gap-6">
      {groups.map((g) => (
        <GroupedList key={g.program} header={g.program}>
          {g.seasons.map((row) => (
            <ListRow
              key={row.id}
              title={row.title}
              subtitle={joinMeta([
                row.code,
                `${keepTogether(formatSeasonDay(row.startDate))} – ${keepTogether(formatSeasonDay(row.endDate))}`,
              ])}
              subtitleLines={3}
              trailing={
                <View className="flex-col items-end gap-1">
                  <StatusChip {...statusChip("season", row.status)} />
                  {row.isCommunityWide ? <StatusChip tone="info" label="Community-wide" /> : null}
                </View>
              }
              chevron
              onPress={() => onOpen(row)}
            />
          ))}
        </GroupedList>
      ))}
    </View>
  );
}
