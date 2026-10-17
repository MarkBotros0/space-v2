import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  updateSessionRequestSchema,
  type RecurrenceScope,
  type SessionDetail,
  type UpdateSessionInput,
} from "@space/shared";

import {
  ScopeSelector,
  SessionFields,
  sessionTypeFor,
  sessionWriteFields,
  type SessionFormValues,
} from "../../../../src/components/SessionForm";
import { FormActions, FormErrorBox } from "../../../../src/design/forms/form-parts";
import { PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Text,
} from "../../../../src/design/ui";
import { useSessionDetail } from "../../../../src/hooks/use-session-detail";
import {
  useDeleteSession,
  useSessionSeries,
  useUpdateSession,
} from "../../../../src/hooks/use-session-writes";
import { apiErrorCode, apiErrorMessage } from "../../../../src/lib/api-error";
import { firstErrorByField } from "../../../../src/lib/form-errors";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";

/** "This will change N sessions" before submitting (spec 03 §9, R59 — v1 never said). V2-ONLY. */
function SeriesImpact({ sessionId, scope }: { sessionId: number; scope: RecurrenceScope }) {
  const series = useSessionSeries(sessionId, scope, scope !== "one");
  if (scope === "one")
    return <Text className="text-xs text-muted-foreground">Only this session.</Text>;
  if (series.isPending) return <RouteSkeleton />;
  if (series.isError) return <RouteError onRetry={() => void series.refetch()} />;
  const n = series.data.sessions.length;
  const withAttendance = series.data.sessions.filter((s) => s.attendanceCount > 0).length;
  return (
    <View className="flex-col gap-1">
      <Text className="text-sm font-medium">
        {`This affects ${n} session${n === 1 ? "" : "s"}${withAttendance > 0 ? `, ${withAttendance} with attendance recorded` : ""}.`}
      </Text>
      {series.data.videoProgressCount > 0 ? (
        <Text className="text-xs text-muted-foreground">
          Video progress has been recorded on some of them.
        </Text>
      ) : null}
      {series.data.sessions.map((s) => (
        <Text key={s.id} className="text-xs text-muted-foreground">
          {`${formatDayKey(s.dayKey)} · ${formatWallTime(s.startTime)}${s.isAnchor ? " (this one)" : ""}`}
        </Text>
      ))}
    </View>
  );
}

function EditSessionForm({ detail }: { detail: SessionDetail }) {
  const router = useRouter();
  const update = useUpdateSession(detail.id);
  const remove = useDeleteSession(detail.id);
  // Pre-filled from the server's org day and time (X13) — nothing converts zones here.
  const [values, setValues] = useState<SessionFormValues>({
    title: detail.title,
    day: detail.dayKey,
    time: detail.startTime,
    durationMinutes: String(detail.durationMinutes),
    sessionType: sessionTypeFor(detail.youtubeUrl),
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
        onSuccess: () =>
          router.replace({ pathname: "/seasons/[code]", params: { code: detail.seasonCode } }),
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
    <View className="flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <View className="flex-col gap-4">
            <SessionFields values={values} onChange={setValues} errors={errors} />
            {isSeries ? (
              <>
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
            <FormErrorBox message={message} />
            <FormActions
              submitLabel="Save changes"
              pending={update.isPending}
              onSubmit={save}
              onCancel={() => router.back()}
            />
          </View>
        </CardContent>
      </Card>
      {/* V2-ONLY: v1 deletes sessions from its session page console. */}
      <Card>
        <CardHeader>
          <CardTitle>Delete</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            className="self-start"
            disabled={remove.isPending}
            onPress={() => onDelete(needsForce)}
          >
            {deleteTitle}
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}

export default function EditSessionScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  const detail = useSessionDetail(id);

  let body: ReactNode;
  if (id === null)
    body = <EmptyState title="Not found" description="That session doesn't exist." />;
  else if (detail.isPending) body = <RouteSkeleton />;
  else if (detail.isError) body = <RouteError onRetry={() => void detail.refetch()} />;
  else if (!detail.data.canManageCheckIn)
    // canManageCheckIn IS isAdminOfSeason (Plan 4) — the same gate PATCH/DELETE enforce.
    body = (
      <EmptyState
        title="Not available"
        description="Only this season's admins can edit its sessions."
      />
    );
  else
    body = (
      <View className="flex-col gap-4">
        <PageTitle title="Edit session" subtitle={`Update ${detail.data.title}.`} />
        <EditSessionForm key={detail.data.id} detail={detail.data} />
      </View>
    );

  return <ShellFrame>{body}</ShellFrame>;
}
