import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SearchX } from "lucide-react-native";
import { View } from "react-native";
import type { AttendanceStatus } from "@space/shared";

import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import {
  AttendanceRosterForm,
  AttendanceSaveBar,
} from "../../../../src/design/sessions/attendance-form";
import { EmptyState } from "../../../../src/design/ui";
import { useAttendanceRoster, useSaveAttendance } from "../../../../src/hooks/use-attendance";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import {
  buildAttendanceEntries,
  type AttendanceMarks,
  type LateMinutesText,
} from "../../../../src/lib/attendance-entries";
import { formatWallTime, formatWeekdayDayYear } from "../../../../src/lib/format";

/**
 * v1 app/leader/sessions/[id]/attendance (and the identical admin page): the
 * session header, then v1's attendance form. Saves send only the rows the
 * caller touched, with stored notes kept (spec 04 R13/R16); success goes
 * back to where the caller came from (B3-14).
 */
export default function AttendanceScreen() {
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const parsed = Number(rawId);
  const sessionId = Number.isInteger(parsed) && parsed > 0 ? parsed : null;

  const session = useSessionDetail(sessionId);
  const {
    data: roster,
    isPending,
    isError,
    refetch,
    isRefetching,
  } = useAttendanceRoster(sessionId);
  const save = useSaveAttendance(sessionId ?? 0);
  const [marks, setMarks] = useState<AttendanceMarks>({});
  const [lateText, setLateText] = useState<LateMinutesText>({});
  const [formError, setFormError] = useState<string | null>(null);

  if (sessionId === null) {
    return (
      <ShellFrame>
        <EmptyState icon={SearchX} title="Not found" description="That session link isn't valid." />
      </ShellFrame>
    );
  }

  const onSave = () => {
    setFormError(null);
    const entries = buildAttendanceEntries(roster ?? [], marks, lateText);
    if (entries.length === 0) {
      setFormError("Mark at least one student before saving.");
      return;
    }
    save.mutate(entries, { onSuccess: () => router.back() });
  };

  const error =
    formError ??
    (save.isError
      ? apiErrorMessage(
          save.error,
          "Couldn't save attendance. Check your connection and try again.",
        )
      : null);
  const detail = session.data;

  return (
    <View className="flex-1">
      <ShellFrame
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
          void session.refetch();
        }}
      >
        {isPending ? (
          <RouteSkeleton />
        ) : isError ? (
          <RouteError onRetry={() => void refetch()} />
        ) : (
          <View className="flex-col gap-4">
            <PageTitle
              title={`Attendance — ${detail?.title ?? "…"}`}
              subtitle={
                detail
                  ? `${formatWeekdayDayYear(detail.dayKey)} · ${formatWallTime(detail.startTime)}`
                  : undefined
              }
            />
            <AttendanceRosterForm
              rows={roster}
              statusOf={(row) => marks[row.studentUserId] ?? row.status}
              lateTextOf={(row) =>
                lateText[row.studentUserId] ??
                (row.lateMinutes !== null ? String(row.lateMinutes) : "")
              }
              pending={save.isPending}
              error={error}
              onMark={(row, status: AttendanceStatus) =>
                setMarks((prev) => ({ ...prev, [row.studentUserId]: status }))
              }
              onMarkAll={(status) =>
                setMarks(Object.fromEntries(roster.map((row) => [row.studentUserId, status])))
              }
              onLateText={(row, text) =>
                setLateText((prev) => ({ ...prev, [row.studentUserId]: text }))
              }
            />
          </View>
        )}
      </ShellFrame>
      {!isPending && !isError && roster.length > 0 ? (
        <AttendanceSaveBar
          pending={save.isPending}
          onSave={onSave}
          onCancel={() => router.back()}
        />
      ) : null}
    </View>
  );
}
