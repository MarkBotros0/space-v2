/**
 * Port of v1 src/components/students/season-history.tsx (student and alumni
 * history). Native differences: <details>/<summary> → a Pressable with the
 * ▶/▼ marker drawn as text; first:border-0 → index.
 * Privacy-critical (spec 02 R34): rows carry attendance % and curriculum only.
 */
import { Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { SeasonHistoryRow } from "@space/shared";

import { formatDate, formatDayKey } from "../../lib/format";
import { cn } from "../lib/cn";
import { shadowStyle } from "../lib/shadow";
import { Badge } from "../ui/badge";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";

function HistoryRow({ row }: { row: SeasonHistoryRow }) {
  const [open, setOpen] = useState(false);
  const count = row.curriculum.length;
  return (
    <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <View>
          <Text className="text-base font-bold text-brand-navy-900 dark:text-foreground">{row.title}</Text>
          <Text className="text-xs text-muted-foreground">
            {`${formatDate(row.startDate)} – ${formatDate(row.endDate)}${row.groupName ? ` · ${row.groupName}` : ""}`}
          </Text>
        </View>
        {/* R40: v1 badges every row "Participated"; the enrollment status is not read. */}
        <View className="flex-row flex-wrap gap-1.5">
          <Badge variant="teal">{`${row.attendancePct}% attended`}</Badge>
          <Badge variant="success">Participated</Badge>
        </View>
      </View>
      {count > 0 ? (
        <View className="mt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((o) => !o)}
            className="flex-row items-center gap-1"
          >
            <Text className="text-[10px] text-brand-navy-700 dark:text-brand-navy-200">{open ? "▼" : "▶"}</Text>
            {/* v1 always says "sessions", even for one. */}
            <Text className="text-sm font-semibold text-brand-navy-700 dark:text-brand-navy-200">
              {`Curriculum (${count} sessions)`}
            </Text>
          </Pressable>
          {open ? (
            <View className="mt-2 flex-col gap-1">
              {row.curriculum.map((s, i) => (
                <View
                  key={s.sessionId}
                  className={cn("flex-row justify-between gap-3", i > 0 && "border-t border-border pt-1")}
                >
                  <Text className="flex-1 text-sm text-muted-foreground">{s.title}</Text>
                  <Text className="shrink-0 text-xs text-muted-foreground">{formatDayKey(s.dayKey)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function SeasonHistory({ rows, emptyDescription }: { rows: SeasonHistoryRow[]; emptyDescription: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={Sparkles} title="No past seasons" description={emptyDescription} />;
  }
  return (
    <View className="flex-col gap-3">
      {rows.map((row) => (
        <HistoryRow key={row.seasonId} row={row} />
      ))}
    </View>
  );
}
