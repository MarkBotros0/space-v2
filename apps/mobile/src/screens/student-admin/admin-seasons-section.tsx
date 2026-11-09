/**
 * Enrollment history for staff: one card row per season (REG-83, R64). The
 * season and its status chip on top, the dates, group and attendance under it,
 * and the row's one action (Drop, Remove on a draft, Bring back) on a line of
 * its own (owner, 2026-11-07: the chip, the figure and a red button were
 * crowded into the right edge).
 */
import { Calendar } from "lucide-react-native";
import { Fragment } from "react";
import { View } from "react-native";
import type { EnrollmentHistoryItem } from "@space/shared";

import { formatDate } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";

type Action = { label: string; accessibilityLabel: string; onPress: () => void; destructive: boolean };

function SeasonRow({ e, action }: { e: EnrollmentHistoryItem; action: Action | null }) {
  const chip = statusChip("enrollment", e.status);
  const meta = joinMeta([
    `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`,
    e.groupName,
    e.attendancePct !== null ? `${e.attendancePct}% attendance` : null,
  ]);
  return (
    <View testID="season-row" className="flex-col gap-2 px-4 py-3">
      <View
        accessible
        accessibilityLabel={joinMeta([e.seasonTitle, chip.label, meta, e.dropReason])}
        className="flex-col gap-1"
      >
        <View className="flex-row items-center gap-2">
          <Text variant="headline" numberOfLines={2} className="min-w-0 flex-1">
            {e.seasonTitle}
          </Text>
          <StatusChip {...chip} className="shrink-0" />
        </View>
        <Text variant="subhead" className="text-muted-foreground">
          {meta}
        </Text>
        {e.dropReason ? (
          <Text variant="subhead" className="text-muted-foreground">
            {`Reason: ${e.dropReason}`}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Button
          variant={action.destructive ? "destructive" : "secondary"}
          size="sm"
          className="self-start"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

export function AdminSeasonsSection({
  enrollments,
  dropFor,
  removeFor,
  restoreFor,
}: {
  enrollments: EnrollmentHistoryItem[];
  /** A season's Drop handler, or null when the viewer may not drop it. */
  dropFor: (enrollment: EnrollmentHistoryItem) => (() => void) | null;
  /** A draft's Remove handler, or null when the viewer may not remove from it. */
  removeFor: (enrollment: EnrollmentHistoryItem) => (() => void) | null;
  /** A dropped season's Bring back handler, or null when the viewer may not restore it. */
  restoreFor: (enrollment: EnrollmentHistoryItem) => (() => void) | null;
}) {
  if (enrollments.length === 0) {
    return (
      <EmptyState icon={Calendar} title="No seasons" description="This student isn't enrolled in any season yet." />
    );
  }
  return (
    <View className="overflow-hidden rounded-group bg-surface">
      {enrollments.map((e, i) => {
        const drop = dropFor(e);
        const remove = removeFor(e);
        const restore = restoreFor(e);
        const action: Action | null = drop
          ? { label: "Drop", accessibilityLabel: `Drop from ${e.seasonTitle}`, onPress: drop, destructive: true }
          : remove
            ? {
                label: "Remove",
                accessibilityLabel: `Remove from ${e.seasonTitle}`,
                onPress: remove,
                destructive: true,
              }
            : restore
              ? {
                  label: "Bring back",
                  accessibilityLabel: `Bring back into ${e.seasonTitle}`,
                  onPress: restore,
                  destructive: false,
                }
              : null;
        return (
          <Fragment key={e.enrollmentId}>
            {i > 0 ? <View className="ml-4 h-px bg-separator" /> : null}
            <SeasonRow e={e} action={action} />
          </Fragment>
        );
      })}
    </View>
  );
}
