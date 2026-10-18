/**
 * Port of v1 src/components/seasons/seasons-list.tsx: seasons grouped by
 * program (A–Z, newest year first), each group a heading with a "{n} year(s)"
 * outline badge over a DataTable. The phone DataTable shows the first column
 * as the primary cell, so the year link leads; v1's Groups column is absent
 * (the list contract carries no group count — gap note).
 */
import type { SeasonListItem } from "@space/shared";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { formatSeasonDay } from "../../lib/format";
import { Badge } from "../ui/badge";
import { DataTable, type DataTableColumn } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";
import { SeasonStatusBadge } from "./season-status-badge";

export function SeasonsList({
  rows,
  onOpen,
  emptyTitle = "No seasons yet",
  emptyDescription = "Create your first season to get started.",
}: {
  rows: SeasonListItem[];
  onOpen: (row: SeasonListItem) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={CalendarIcon} title={emptyTitle} description={emptyDescription} />;
  }

  const columns: DataTableColumn<SeasonListItem>[] = [
    {
      key: "year",
      header: "Year",
      cell: (row) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${row.title}`}
          onPress={() => onOpen(row)}
        >
          <Text className="font-medium text-foreground">{String(row.year)}</Text>
        </Pressable>
      ),
    },
    {
      key: "code",
      header: "Code",
      cell: (row) => <Text className="font-mono text-xs">{row.code}</Text>,
    },
    { key: "status", header: "Status", cell: (row) => <SeasonStatusBadge status={row.status} /> },
    {
      key: "dates",
      header: "Dates",
      cell: (row) => (
        <Text className="text-xs text-muted-foreground">
          {`${formatSeasonDay(row.startDate)} – ${formatSeasonDay(row.endDate)}`}
        </Text>
      ),
    },
  ];

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
        <View key={g.program} className="flex-col gap-2">
          <View className="flex-row items-baseline gap-2">
            <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
              {g.program}
            </Text>
            <Badge variant="outline">{`${g.seasons.length} year${g.seasons.length === 1 ? "" : "s"}`}</Badge>
          </View>
          <DataTable columns={columns} rows={g.seasons} rowKey={(r) => r.id} />
        </View>
      ))}
    </View>
  );
}
