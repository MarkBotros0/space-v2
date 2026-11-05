/** Enrollment history for staff: one row per season, with a Drop on the rows the viewer may drop (REG-83, R64). */
import { Calendar } from "lucide-react-native";
import { View } from "react-native";
import type { EnrollmentHistoryItem } from "@space/shared";

import { formatDate } from "../../lib/format";
import { joinMeta } from "../../lib/join-meta";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";

export function AdminSeasonsSection({
  enrollments,
  dropFor,
}: {
  enrollments: EnrollmentHistoryItem[];
  /** A season's Drop handler, or null when the viewer may not drop it. */
  dropFor: (enrollment: EnrollmentHistoryItem) => (() => void) | null;
}) {
  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No seasons"
        description="This student isn't enrolled in any season yet."
      />
    );
  }
  return (
    <GroupedList>
      {enrollments.map((e, i) => {
        const chip = statusChip("enrollment", e.status);
        const drop = dropFor(e);
        return (
          <ListRow
            key={e.enrollmentId}
            index={i}
            title={e.seasonTitle}
            subtitle={joinMeta([
              `${formatDate(e.startDate)} – ${formatDate(e.endDate)}`,
              e.groupName,
              e.dropReason,
            ])}
            subtitleLines={3}
            trailing={
              <View className="items-end gap-1">
                <StatusChip {...chip} />
                {e.attendancePct !== null ? (
                  <Text variant="caption" className="text-muted-foreground">
                    {`${e.attendancePct}% attendance`}
                  </Text>
                ) : null}
                {drop ? (
                  <Button variant="destructive" size="sm" onPress={drop}>
                    Drop
                  </Button>
                ) : null}
              </View>
            }
            trailingLabel={joinMeta([
              chip.label,
              e.attendancePct !== null && `${e.attendancePct}% attendance`,
            ])}
          />
        );
      })}
    </GroupedList>
  );
}
