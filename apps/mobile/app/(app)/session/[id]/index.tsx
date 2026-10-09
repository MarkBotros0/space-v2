import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AttendanceRosterRow, MyAttendance, SessionDetail } from "@space/shared";

import { StudentCheckInCard } from "../../../../src/components/check-in/StudentCheckInCard";
import { SessionQuizzesCard } from "../../../../src/components/SessionQuizzesCard";
import { VideoQuestionsEditor, VideoQuizResultsTable } from "../../../../src/components/VideoQuestionsEditor";
import { VideoQuizPlayer } from "../../../../src/components/VideoQuizPlayer";
import { useAttendanceRoster } from "../../../../src/hooks/use-attendance";
import { useCheckInState, useRegenerateCheckIn } from "../../../../src/hooks/use-check-in";
import { useCloseCheckIn, useOpenCheckIn, useSessionDetail } from "../../../../src/hooks/use-session-detail";
import { useStudentVideoQuiz } from "../../../../src/hooks/use-video-quiz";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import { checkInUrlFor } from "../../../../src/lib/app-config";
import { formatDayKey, formatWallTime } from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useSessionStore } from "../../../../src/store/session";
import { useTheme } from "../../../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../../../src/ui";

/** v1's leader page refreshed every 10s while check-in was open (check-in-attendance-list.tsx:58). */
export const LIVE_ROSTER_REFRESH_MS = 10_000;

function attendanceLine(a: MyAttendance): string {
  if (a.status === "PRESENT") return "Your attendance: Present";
  if (a.status === "LATE") {
    return a.lateMinutes !== null ? `Your attendance: Late (${a.lateMinutes} min)` : "Your attendance: Late";
  }
  return "Your attendance: Absent";
}

function rosterStatus(row: AttendanceRosterRow): string {
  if (row.status === "PRESENT") return "Present";
  if (row.status === "LATE") return "Late";
  if (row.status === "ABSENT") return "Absent";
  return "Not checked in";
}

/** Season admins only (canManageCheckIn): open/close/regenerate and the QR. */
function CheckInConsole({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const open = useOpenCheckIn(detail.id);
  const close = useCloseCheckIn(detail.id);
  const regenerate = useRegenerateCheckIn(detail.id);
  // The narrow admin-only read (D-16.9) — after an app restart, the open
  // session's QR comes back without a reopen and without the season-wide list.
  const checkIn = useCheckInState(detail.id, true);
  const token = checkIn.data?.checkInToken ?? open.token;
  const [error, setError] = useState<string | null>(null);
  const [regenArmed, setRegenArmed] = useState(false);

  const onOpen = () => {
    setError(null);
    open.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't open check-in.")) });
  };
  const onClose = () => {
    setError(null);
    close.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't close check-in.")) });
  };
  const onRegenerate = () => {
    // While open, a code on the room screen stops working — confirm (spec 03 §10 item 9).
    if (detail.checkInOpen && !regenArmed) {
      setRegenArmed(true);
      return;
    }
    setRegenArmed(false);
    setError(null);
    regenerate.mutate(undefined, { onError: (err) => setError(apiErrorMessage(err, "Couldn't replace the code.")) });
  };

  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Check-in</Text>
      {detail.checkInOpen ? (
        <>
          {token ? (
            <View style={{ alignItems: "center", gap: theme.spacing.sm }}>
              {/* v1's full check-in URL (03-sessions R68); the typed code below stays the bare token. */}
              <QRCode value={checkInUrlFor(token)} size={220} />
              <Text variant="caption">{`Code: ${token}`}</Text>
              {checkIn.data?.expiresAtTime ? (
                <Text variant="caption">{`Closes at ${formatWallTime(checkIn.data.expiresAtTime)}`}</Text>
              ) : null}
              {/* Spec 04 D3's risk, stated until the rotating-code upgrade lands. */}
              <Text variant="caption" color={theme.colors.neutral[600]}>
                Anyone with this code can check in — keep it on the room screen only.
              </Text>
            </View>
          ) : (
            <Text variant="label">Loading the check-in code…</Text>
          )}
          <Button title="Close check-in" variant="secondary" onPress={onClose} loading={close.isPending} />
        </>
      ) : (
        <Button title="Open check-in" onPress={onOpen} loading={open.isPending} />
      )}
      {token ? (
        <Button
          title={regenArmed ? "Replace the code? The current one stops working." : "Regenerate code"}
          variant="ghost"
          onPress={onRegenerate}
          loading={regenerate.isPending}
        />
      ) : null}
      {error ? <Text variant="label" color={theme.colors.error[500]}>{error}</Text> : null}
      <Text variant="heading">Checked in</Text>
      <LiveRoster detail={detail} emptyText="No students are enrolled yet." />
    </Card>
  );
}

/**
 * Who has checked in, polled every 10s while check-in is open (v1's
 * check-in-attendance-list.tsx:58 router.refresh). The roster endpoint narrows
 * a leader to their own groups server-side.
 */
function LiveRoster({ detail, emptyText }: { detail: SessionDetail; emptyText: string }) {
  const theme = useTheme();
  const roster = useAttendanceRoster(detail.id);
  const { refetch } = roster;

  useEffect(() => {
    if (!detail.checkInOpen) return undefined;
    const timer = setInterval(() => void refetch(), LIVE_ROSTER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [detail.checkInOpen, refetch]);

  if (roster.isPending) return <LoadingState />;
  if (roster.isError) return <ErrorState message="Couldn't load the roster." onRetry={() => void refetch()} />;
  if (roster.data.length === 0) {
    return <Text variant="body" color={theme.colors.neutral[600]}>{emptyText}</Text>;
  }
  const checkedIn = roster.data.filter((r) => r.status !== null).length;
  return (
    <>
      <Text variant="label">{`${checkedIn} of ${roster.data.length} checked in`}</Text>
      {roster.data.map((row) => (
        <View key={row.studentUserId} style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="body">{row.name ?? row.email}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>{rosterStatus(row)}</Text>
        </View>
      ))}
    </>
  );
}

/** Group leaders, and a SUPER who is not this season's admin: who has checked in, read-only — v1 /leader/sessions/[id]. */
function LiveCheckInRoster({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  return (
    <Card style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
      <Text variant="heading">Check-in</Text>
      <Text variant="label">{detail.checkInOpen ? "Check-in is open" : "Check-in is closed"}</Text>
      <LiveRoster detail={detail} emptyText="No students in your groups." />
    </Card>
  );
}

/**
 * The session's interactive video (Plan 14). Students get the player; a season
 * admin / SUPER gets the question editor (which reads the answer key); a LEADER
 * gets the results table only. Nothing renders for a session with no video — v1
 * lets an admin author a full quiz no student can ever reach (R17).
 */
function VideoSection({ detail }: { detail: SessionDetail }) {
  const theme = useTheme();
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
  const isStudent = user?.role === "STUDENT";
  // Mirrors canManageSessionVideo exactly: SUPER, or an ADMIN of this season.
  // NOT `canMarkAttendance` — that flag admits a group LEADER, who may not
  // author questions. The server enforces the gate regardless; this only decides
  // whether the editor (and its answer-key read) is ever mounted.
  const canAuthorVideo =
    user?.role === "SUPER" ||
    (user?.role === "ADMIN" && (scopes?.seasonAdminIds ?? []).includes(detail.seasonId));
  // Results: authors, plus a LEADER (the server narrows a leader to their groups).
  const canSeeResults = canAuthorVideo || user?.role === "LEADER";
  const hasVideo = detail.youtubeUrl !== null;
  const quiz = useStudentVideoQuiz(detail.id, isStudent && hasVideo);

  if (!hasVideo) return null;

  if (isStudent) {
    const youtubeUrl = detail.youtubeUrl;
    return (
      <View style={{ marginTop: theme.spacing.md }}>
        {quiz.isPending ? (
          <LoadingState />
        ) : quiz.isError ? (
          <ErrorState message="Couldn't load the video quiz." onRetry={() => void quiz.refetch()} />
        ) : quiz.data.questions.length === 0 ? (
          <Button
            title="Watch on YouTube"
            variant="secondary"
            onPress={() => {
              if (youtubeUrl !== null) void Linking.openURL(youtubeUrl);
            }}
          />
        ) : (
          <VideoQuizPlayer sessionId={detail.id} quiz={quiz.data} onRetry={() => void quiz.refetch()} />
        )}
      </View>
    );
  }
  if (canAuthorVideo) return <VideoQuestionsEditor sessionId={detail.id} />;
  if (canSeeResults) {
    return (
      <View style={{ marginTop: theme.spacing.md }}>
        <VideoQuizResultsTable sessionId={detail.id} />
      </View>
    );
  }
  return null;
}

function SessionDetailBody({ id }: { id: number }) {
  const theme = useTheme();
  const router = useRouter();
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonAdminIds = useSessionStore((s) => s.scopes?.seasonAdminIds);
  const { data, isPending, isError, refetch, isRefetching } = useSessionDetail(id);

  if (isPending) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <LoadingState />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <ErrorState message="Couldn't load this session." onRetry={() => void refetch()} />
      </Screen>
    );
  }

  // v1 showed the console only to an admin OF the season; the API also lets any
  // SUPER through (isAdminOfSeason), so the app narrows it (REG-79).
  const showConsole =
    data.canManageCheckIn && (role !== "SUPER" || (seasonAdminIds ?? []).includes(data.seasonId));

  return (
    <Screen edges={["top", "left", "right"]} scroll onRefresh={() => void refetch()} refreshing={isRefetching}>
      <Card>
        <Text variant="title">{data.title}</Text>
        {/* Org day and time from the server (X13) — the device zone never re-reads startsAt. */}
        <Text variant="label" color={theme.colors.neutral[600]}>
          {`${formatDayKey(data.dayKey)} · ${formatWallTime(data.startTime)} · ${data.durationMinutes} min`}
        </Text>
        {data.location ? <Text variant="body">{data.location}</Text> : null}
        {data.description ? <Text variant="body">{data.description}</Text> : null}
        {data.myAttendance ? <Text variant="label">{attendanceLine(data.myAttendance)}</Text> : null}
      </Card>

      {data.canManageCheckIn ? (
        <Button
          title="Edit session"
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push({ pathname: "/session/[id]/edit", params: { id: String(id) } })}
        />
      ) : null}

      {showConsole ? (
        <CheckInConsole detail={data} />
      ) : data.canMarkAttendance ? (
        <LiveCheckInRoster detail={data} />
      ) : role === "STUDENT" ? (
        // Spec 04 §9 row 3: students get the check-in action (Plan 11, G2).
        <StudentCheckInCard detail={data} />
      ) : null}

      {data.canMarkAttendance ? <SessionQuizzesCard sessionId={data.id} /> : null}

      <VideoSection detail={data} />

      {data.canMarkAttendance ? (
        <Button
          title="Mark attendance"
          variant="secondary"
          style={{ marginTop: theme.spacing.md }}
          onPress={() => router.push({ pathname: "/session/[id]/attendance", params: { id: String(id) } })}
        />
      ) : null}
    </Screen>
  );
}

export default function SessionDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  if (id === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Not found" message="That session doesn't exist." />
      </Screen>
    );
  }
  return <SessionDetailBody id={id} />;
}
