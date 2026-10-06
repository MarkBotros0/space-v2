import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  updateSessionRequestSchema,
  type RecurrenceScope,
  type SessionDetail,
  type UpdateSessionInput,
} from "@space/shared";

import { ScopeSelector, SessionFields, sessionWriteFields, type SessionFormValues } from "../../../../src/components/SessionForm";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { useDeleteSession, useSessionSeries, useUpdateSession } from "../../../../src/hooks/use-session-writes";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { firstErrorByField } from "../../../../src/lib/form-errors";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/** "This will change N sessions" before submitting (spec 03 §9, R59 — v1 never said). */
function SeriesImpact({ sessionId, scope }: { sessionId: number; scope: RecurrenceScope }) {
  const theme = useTheme();
  const series = useSessionSeries(sessionId, scope, scope !== "one");
  if (scope === "one") return <Text variant="caption">Only this session.</Text>;
  if (series.isPending) return <LoadingState />;
  if (series.isError) return <ErrorState message="Couldn't preview the series." onRetry={() => void series.refetch()} />;
  const n = series.data.sessions.length;
  const withAttendance = series.data.sessions.filter((s) => s.attendanceCount > 0).length;
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label">
        {`This affects ${n} session${n === 1 ? "" : "s"}${withAttendance > 0 ? `, ${withAttendance} with attendance recorded` : ""}.`}
      </Text>
      {series.data.videoProgressCount > 0 ? (
        <Text variant="caption">Video progress has been recorded on some of them.</Text>
      ) : null}
      {series.data.sessions.map((s) => (
        <Text key={s.id} variant="caption" color={theme.colors.neutral[600]}>
          {`${formatDayKey(s.dayKey)} · ${formatWallTime(s.startTime)}${s.isAnchor ? " (this one)" : ""}`}
        </Text>
      ))}
    </View>
  );
}

function EditSessionForm({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const update = useUpdateSession(detail.id);
  const remove = useDeleteSession(detail.id);
  // Pre-filled from the server's org day and time (X13) — nothing converts zones here.
  const [values, setValues] = useState<SessionFormValues>({
    title: detail.title,
    day: detail.dayKey,
    time: detail.startTime,
    durationMinutes: String(detail.durationMinutes),
    location: detail.location ?? "",
    youtubeUrl: detail.youtubeUrl ?? "",
    description: detail.description ?? "",
  });
  const isSeries = detail.recurrenceGroupId !== null;
  const [scope, setScope] = useState<RecurrenceScope>("one");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);

  const save = () => {
    setMessage(null);
    const body: UpdateSessionInput = { ...sessionWriteFields(values), scope };
    const parsed = updateSessionRequestSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(firstErrorByField(parsed.error));
      return;
    }
    setErrors({});
    update.mutate(body, {
      onSuccess: () => router.back(),
      onError: (err) => setMessage(apiErrorMessage(err, "Couldn't save the session.")),
    });
  };

  const onDelete = (force: boolean) => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setMessage(null);
    remove.mutate(
      { scope, force },
      {
        onSuccess: () => router.replace({ pathname: "/seasons/[code]", params: { code: detail.seasonCode } }),
        onError: (err) => {
          // Plan 3 refuses to destroy attendance/video progress without force (C12).
          if (apiErrorCode(err) === "has_student_records") setNeedsForce(true);
          setMessage(apiErrorMessage(err, "Couldn't delete."));
        },
      },
    );
  };

  const deleteTitle = needsForce
    ? armed
      ? "Really delete, including attendance?"
      : "Delete including attendance"
    : armed
      ? "Really delete?"
      : scope === "one"
        ? "Delete session"
        : "Delete sessions";

  return (
    <>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text variant="heading">Edit session</Text>
        <SessionFields values={values} onChange={setValues} errors={errors} />
        {isSeries ? (
          <>
            <Text variant="label">Apply to</Text>
            <ScopeSelector
              value={scope}
              onChange={(s) => {
                setScope(s);
                setArmed(false);
                setNeedsForce(false);
              }}
            />
            <SeriesImpact sessionId={detail.id} scope={scope} />
          </>
        ) : null}
        {message ? <Text variant="label" color={theme.colors.error[500]}>{message}</Text> : null}
        <Button title="Save changes" onPress={save} loading={update.isPending} />
      </Card>
      <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Text variant="heading">Delete</Text>
        <Button title={deleteTitle} variant="ghost" onPress={() => onDelete(needsForce)} loading={remove.isPending} />
      </Card>
    </>
  );
}

export default function EditSessionScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useSessionDetail(id);

  let body: ReactNode;
  if (id === null) body = <EmptyState title="Not found" message="That session doesn't exist." />;
  else if (detail.isPending) body = <LoadingState />;
  else if (detail.isError) body = <ErrorState message="Couldn't load this session." onRetry={() => void detail.refetch()} />;
  else if (!detail.data.canManageCheckIn)
    // canManageCheckIn IS isAdminOfSeason (Plan 4) — the same gate PATCH/DELETE enforce.
    body = <EmptyState title="Not available" message="Only this season's admins can edit its sessions." />;
  else body = <EditSessionForm key={detail.data.id} detail={detail.data} />;

  return (
    <Screen edges={["top", "left", "right"]} scroll>
      {body}
    </Screen>
  );
}
