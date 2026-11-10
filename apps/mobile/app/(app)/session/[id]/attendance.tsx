import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import type { AttendanceStatus } from "@space/shared";

import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { SaveBar } from "../../../../src/design/layout/save-bar";
import { Screen } from "../../../../src/design/layout/screen";
import { haptic } from "../../../../src/design/motion";
import { AttendanceRosterForm } from "../../../../src/screens/session-detail/attendance-form";
import { EmptyState } from "../../../../src/design/ui";
import { toast } from "../../../../src/design/ui/toaster";
import { useAttendanceRoster, useSaveAttendance } from "../../../../src/hooks/use-attendance";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import {
  buildAttendanceEntries,
  type AttendanceMarks,
  type LateMinutesText,
} from "../../../../src/lib/attendance-entries";
import { formatWallTime, formatWeekdayDay, unbreakable } from "../../../../src/lib/format";

/**
 * v1 app/leader/sessions/[id]/attendance (and the identical admin page): the
 * session header, then v1's attendance form with the save bar pinned. Saves send only the rows the
 * caller touched, with stored notes kept (spec 04 R13/R16); success goes
 * back to where the caller came from (B3-14).
 */
export default function AttendanceScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const sessionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const session = useSessionDetail(sessionId);
  const { data: roster, isPending, isError, refetch, isRefetching } = useAttendanceRoster(sessionId);
  const save = useSaveAttendance(sessionId);
  const [marks, setMarks] = useState<AttendanceMarks>({});
  const [lateText, setLateText] = useState<LateMinutesText>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (sessionId === null) {
    return (
      <Screen title="Attendance">
        <EmptyState icon={SearchX} title="Not found" description="That session link isn't valid." />
      </Screen>
    );
  }

  const onSave = () => {
    setFormError(null);
    const entries = buildAttendanceEntries(roster ?? [], marks, lateText);
    if (entries.length === 0) {
      setFormError("Mark at least one student before saving.");
      return;
    }
    save.mutate(entries, {
      onSuccess: () => {
        haptic("light");
        toast.success("Attendance saved.");
        router.back();
      },
    });
  };

  const error =
    formError ??
    (save.isError
      ? apiErrorMessage(save.error, "Couldn't save attendance. Check your connection and try again.")
      : null);
  const detail = session.data;

  const changed = buildAttendanceEntries(roster ?? [], marks, lateText).length;

  return (
    <Screen
      title="Attendance"
      subtitle={
        detail
          ? `${detail.title} · ${unbreakable(formatWeekdayDay(detail.dayKey))} · ${unbreakable(formatWallTime(detail.startTime))}`
          : undefined
      }
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
        void session.refetch();
      }}
      footer={
        roster && roster.length > 0 ? (
          <SaveBar
            label="Save attendance"
            onPress={onSave}
            loading={save.isPending}
            hint={changed > 0 ? `${changed} changed` : undefined}
            error={error}
          />
        ) : undefined
      }
    >
      {isPending ? (
        <RouteSkeleton />
      ) : isError ? (
        <RouteError onRetry={() => void refetch()} />
      ) : (
        <AttendanceRosterForm
          rows={roster}
          statusOf={(row) => marks[row.studentUserId] ?? row.status}
          lateTextOf={(row) => lateText[row.studentUserId] ?? (row.lateMinutes !== null ? String(row.lateMinutes) : "")}
          pending={save.isPending}
          onMark={(row, status: AttendanceStatus) => setMarks((prev) => ({ ...prev, [row.studentUserId]: status }))}
          onMarkAll={(status) => setMarks(Object.fromEntries(roster.map((row) => [row.studentUserId, status])))}
          onLateText={(row, text) => setLateText((prev) => ({ ...prev, [row.studentUserId]: text }))}
        />
      )}
    </Screen>
  );
}
