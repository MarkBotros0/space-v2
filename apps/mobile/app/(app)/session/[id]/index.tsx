import { CheckCheck, Clock, MapPin, PenLine, QrCode, RotateCcw } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { MyAttendance, SessionDetail } from "@space/shared";

import { StudentCheckInCard } from "../../../../src/components/check-in/StudentCheckInCard";
import {
  VideoQuestionsEditor,
  VideoQuizResultsTable,
} from "../../../../src/components/VideoQuestionsEditor";
import { VideoQuizPlayer, WatchRecordingButton } from "../../../../src/components/VideoQuizPlayer";
import { FormErrorBox } from "../../../../src/design/forms/form-parts";
import { BackLink, Eyebrow, PageTitle } from "../../../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../../../src/design/layout/route-states";
import { ShellFrame } from "../../../../src/design/layout/shell-frame";
import { iconWithClassName } from "../../../../src/design/lib/icon";
import { shadowStyle } from "../../../../src/design/lib/shadow";
import { CheckInAttendanceList } from "../../../../src/design/sessions/check-in-attendance-list";
import {
  Badge,
  Button as ButtonV1,
  Card as CardV1,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Text as TextV1,
} from "../../../../src/design/ui";
import { useAttendanceRoster, useSaveAttendance } from "../../../../src/hooks/use-attendance";
import { useSessionQuizzes } from "../../../../src/hooks/use-session-quizzes";
import { useCheckInState, useRegenerateCheckIn } from "../../../../src/hooks/use-check-in";
import {
  useCloseCheckIn,
  useOpenCheckIn,
  useSessionDetail,
} from "../../../../src/hooks/use-session-detail";
import { useStudentVideoQuiz, useVideoQuizResults } from "../../../../src/hooks/use-video-quiz";
import { apiErrorMessage } from "../../../../src/lib/api-error";
import {
  addMinutesToWallTime,
  formatDayKey,
  formatLongDayYear,
  formatWallTime,
  formatWeekdayDay,
} from "../../../../src/lib/format";
import { parsePositiveInt } from "../../../../src/lib/params";
import { useSessionStore } from "../../../../src/store/session";

/** v1's leader page refreshed every 10s while check-in was open (check-in-attendance-list.tsx:58). */
export const LIVE_ROSTER_REFRESH_MS = 10_000;

iconWithClassName(CheckCheck, Clock, MapPin, PenLine, QrCode, RotateCcw);

function attendanceLine(a: MyAttendance): string {
  if (a.status === "PRESENT") return "Your attendance: Present";
  if (a.status === "LATE") {
    return a.lateMinutes !== null
      ? `Your attendance: Late (${a.lateMinutes} min)`
      : "Your attendance: Late";
  }
  return "Your attendance: Absent";
}

/**
 * The session's interactive video (Plan 14), staff side — students get the player in StudentSessionBody. A season
 * admin / SUPER gets the question editor (which reads the answer key); a LEADER
 * gets the results table only. Nothing renders for a session with no video — v1
 * lets an admin author a full quiz no student can ever reach (R17).
 */
function VideoSection({ detail }: { detail: SessionDetail }) {
  const user = useSessionStore((s) => s.user);
  const scopes = useSessionStore((s) => s.scopes);
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

  if (!hasVideo) return null;

  if (canAuthorVideo) return <VideoQuestionsEditor sessionId={detail.id} />;
  if (canSeeResults) {
    return (
      <View>
        <VideoQuizResultsTable sessionId={detail.id} />
      </View>
    );
  }
  return null;
}

/** v1 app/student/sessions/[id]/page.tsx + the v2 extras kept by B2-14. */
function StudentSessionBody({
  data,
  refetch,
  isRefetching,
}: {
  data: SessionDetail;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const router = useRouter();
  const hasVideo = data.youtubeUrl !== null;
  const quiz = useStudentVideoQuiz(data.id, hasVideo);
  // Org wall times from the server (X13); the end is text arithmetic on the org clock.
  const end = addMinutesToWallTime(data.startTime, data.durationMinutes);

  let video: ReactNode = null;
  if (hasVideo) {
    if (quiz.isPending) video = <RouteSkeleton />;
    else if (quiz.isError)
      video = (
        <View className="flex-col items-start gap-2">
          <TextV1 className="text-sm text-error-600 dark:text-error-400">
            Couldn't load the video quiz.
          </TextV1>
          <ButtonV1 variant="outline" size="sm" onPress={() => void quiz.refetch()}>
            Try again
          </ButtonV1>
        </View>
      );
    else if (quiz.data.questions.length === 0 && data.youtubeUrl !== null)
      video = <WatchRecordingButton youtubeUrl={data.youtubeUrl} />;
    else
      video = (
        <VideoQuizPlayer sessionId={data.id} quiz={quiz.data} onRetry={() => void quiz.refetch()} />
      );
  }

  return (
    <ShellFrame onRefresh={refetch} refreshing={isRefetching}>
      <View className="flex-col gap-3">
        <View>
          <BackLink label="Calendar" onPress={() => router.back()} />
          <View
            className="mt-2 rounded-2xl border border-border bg-card p-5"
            style={shadowStyle("soft")}
          >
            <View className="mb-2 flex-row items-center gap-2">
              <Badge variant={hasVideo ? "teal" : "outline"}>
                {hasVideo ? "Online" : "In-person"}
              </Badge>
            </View>
            <PageTitle title={data.title} size="detail" />
            <TextV1 className="mt-1 text-sm text-muted-foreground">
              {formatLongDayYear(data.dayKey)}
            </TextV1>
          </View>
        </View>

        {video}

        <View className="rounded-2xl border border-border bg-card p-4" style={shadowStyle("soft")}>
          <Eyebrow>Details</Eyebrow>
          <View className="mt-2 flex-col gap-2">
            <View className="flex-row items-center gap-2">
              <Clock size={16} className="shrink-0 text-brand-teal-600" />
              <TextV1 className="text-sm text-muted-foreground">
                {`${formatWallTime(data.startTime)} – ${formatWallTime(end)} · ${data.durationMinutes} min`}
              </TextV1>
            </View>
            {data.location ? (
              <View className="flex-row items-center gap-2">
                <MapPin size={16} className="shrink-0 text-brand-teal-600" />
                <TextV1 className="text-sm text-muted-foreground">{data.location}</TextV1>
              </View>
            ) : null}
            {data.myAttendance ? (
              <View className="flex-row items-center gap-2">
                <CheckCheck size={16} className="shrink-0 text-brand-teal-600" />
                <TextV1 className="text-sm text-muted-foreground">
                  {attendanceLine(data.myAttendance)}
                </TextV1>
              </View>
            ) : null}
          </View>
        </View>

        {data.description ? (
          <View
            className="rounded-2xl border border-border bg-card p-4"
            style={shadowStyle("soft")}
          >
            <Eyebrow className="mb-2">About</Eyebrow>
            <TextV1 className="text-sm text-foreground/90">{data.description}</TextV1>
          </View>
        ) : null}

        {/* Spec 04 §9 row 3: students get the check-in action (Plan 11, G2). */}
        <StudentCheckInCard detail={data} />
      </View>
    </ShellFrame>
  );
}

/** v1 leader page: the session's quizzes, each with a "Grade →" link (shown only when there are any). */
function LeaderQuizzesCard({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const quizzes = useSessionQuizzes(sessionId, true);
  if (quizzes.isPending || (quizzes.data?.length ?? 0) === 0) {
    if (!quizzes.isError) return null;
  }
  return (
    <CardV1>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <PenLine size={16} className="text-brand-teal-600" />
          <CardTitle className="text-base">Quizzes</CardTitle>
        </View>
      </CardHeader>
      <CardContent>
        {quizzes.isError ? (
          <View className="flex-col items-start gap-2">
            <TextV1 className="text-sm text-error-600 dark:text-error-400">
              Couldn't load this session's quizzes.
            </TextV1>
            <ButtonV1 variant="outline" size="sm" onPress={() => void quizzes.refetch()}>
              Try again
            </ButtonV1>
          </View>
        ) : (
          (quizzes.data ?? []).map((q, i, all) => (
            <View
              key={q.id}
              className={`flex-row items-center justify-between gap-3 py-2 ${i === 0 ? "pt-0" : "border-t border-border"} ${i === all.length - 1 ? "pb-0" : ""}`}
            >
              <View className="min-w-0 flex-1">
                <TextV1 className="text-sm font-semibold text-brand-navy-900 dark:text-foreground">
                  {q.title}
                </TextV1>
                <TextV1 className="text-xs text-muted-foreground">
                  {/* "· Draft" is v2's: an unpublished online quiz has nothing to grade yet. */}
                  {q.kind === "ONLINE" && q.publishedAt === null
                    ? `Max score: ${q.maxScore} · Draft`
                    : `Max score: ${q.maxScore}`}
                </TextV1>
              </View>
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  router.push({ pathname: "/quiz/[id]/grade", params: { id: String(q.id) } })
                }
              >
                {/* v1 has no dark: variant on this link. */}
                <TextV1 className="text-xs font-semibold text-brand-teal-700">Grade →</TextV1>
              </Pressable>
            </View>
          ))
        )}
      </CardContent>
    </CardV1>
  );
}

/**
 * v1's attendance list with per-student override (CheckInAttendanceList).
 * Polled every 10s while open (v1 router.refresh). The override is one entry
 * through the batch write (spec 04 D7), carrying the stored notes and late
 * minutes v1's override wiped (R32).
 */
function CheckInRoster({ detail }: { detail: SessionDetail }) {
  const roster = useAttendanceRoster(detail.id);
  const save = useSaveAttendance(detail.id);
  const { refetch } = roster;

  useEffect(() => {
    if (!detail.checkInOpen) return undefined;
    const timer = setInterval(() => void refetch(), LIVE_ROSTER_REFRESH_MS);
    return () => clearInterval(timer);
  }, [detail.checkInOpen, refetch]);

  if (roster.isPending) {
    return <TextV1 className="py-4 text-center text-sm text-muted-foreground">Loading…</TextV1>;
  }
  if (roster.isError) {
    return (
      <View className="flex-col items-start gap-2">
        <TextV1 className="text-sm text-error-600 dark:text-error-400">
          Couldn't load the roster.
        </TextV1>
        <ButtonV1 variant="outline" size="sm" onPress={() => void refetch()}>
          Try again
        </ButtonV1>
      </View>
    );
  }
  return (
    <CheckInAttendanceList
      rows={roster.data}
      pending={save.isPending}
      error={save.isError ? apiErrorMessage(save.error, "Couldn't save the attendance.") : null}
      onOverride={(row, status, done) =>
        save.mutate(
          [
            {
              studentUserId: row.studentUserId,
              status,
              notes: row.notes,
              lateMinutes: status === "LATE" ? row.lateMinutes : null,
            },
          ],
          {
            onSuccess: () => {
              save.reset();
              done();
            },
          },
        )
      }
    />
  );
}

/** Leader, and a SUPER who is not this season's admin: v1's read-only card with an Open/Closed badge. */
function LeaderCheckInCard({ detail }: { detail: SessionDetail }) {
  return (
    <CardV1>
      <CardHeader className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <QrCode size={16} className="text-foreground" />
          <CardTitle className="text-base">Check-in</CardTitle>
        </View>
        {detail.checkInOpen ? (
          <Badge variant="success">Open</Badge>
        ) : (
          <Badge variant="outline">Closed</Badge>
        )}
      </CardHeader>
      <CardContent className="flex-col gap-6">
        <CheckInRoster detail={detail} />
      </CardContent>
    </CardV1>
  );
}

/**
 * Season admins only (canManageCheckIn) — v1 admin session page's check-in
 * card: Regenerate QR + Open/Close in the header, "Closes at", the QR, then
 * the roster. The QR is a deliberate difference from the leader card.
 */
function CheckInConsoleCard({ detail }: { detail: SessionDetail }) {
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
    open.mutate(undefined, {
      onError: (err) => setError(apiErrorMessage(err, "Couldn't open check-in.")),
    });
  };
  const onClose = () => {
    setError(null);
    close.mutate(undefined, {
      onError: (err) => setError(apiErrorMessage(err, "Couldn't close check-in.")),
    });
  };
  const onRegenerate = () => {
    // While open, a code on the room screen stops working — confirm (spec 03 §10 item 9).
    if (detail.checkInOpen && !regenArmed) {
      setRegenArmed(true);
      return;
    }
    setRegenArmed(false);
    setError(null);
    regenerate.mutate(undefined, {
      onError: (err) => setError(apiErrorMessage(err, "Couldn't replace the code.")),
    });
  };

  return (
    <CardV1>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <QrCode size={16} className="text-foreground" />
          <CardTitle className="text-base">Check-in</CardTitle>
        </View>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          {token ? (
            <ButtonV1
              variant="ghost"
              size="sm"
              disabled={regenerate.isPending}
              onPress={onRegenerate}
            >
              <RotateCcw size={16} className="text-foreground" />
              {regenArmed ? "Replace the code? The current one stops working." : "Regenerate code"}
            </ButtonV1>
          ) : null}
          {detail.checkInOpen ? (
            <ButtonV1 variant="outline" size="sm" disabled={close.isPending} onPress={onClose}>
              Close check-in
            </ButtonV1>
          ) : (
            <ButtonV1 size="sm" disabled={open.isPending} onPress={onOpen}>
              Open check-in
            </ButtonV1>
          )}
        </View>
      </CardHeader>
      <CardContent className="flex-col gap-6">
        {detail.checkInOpen && checkIn.data?.expiresAtTime ? (
          <TextV1 className="text-xs text-muted-foreground">
            {`Closes at ${formatWallTime(checkIn.data.expiresAtTime)}`}
          </TextV1>
        ) : null}
        {detail.checkInOpen ? (
          token ? (
            <View className="items-center gap-2">
              <QRCode value={token} size={220} />
              <TextV1 className="text-xs text-muted-foreground">{`Code: ${token}`}</TextV1>
              {/* Spec 04 D3's risk, stated until the rotating-code upgrade lands. */}
              <TextV1 className="text-center text-xs text-muted-foreground">
                Anyone with this code can check in — keep it on the room screen only.
              </TextV1>
            </View>
          ) : (
            <TextV1 className="text-sm text-muted-foreground">Loading the check-in code…</TextV1>
          )
        ) : null}
        <FormErrorBox message={error} />
        <CheckInRoster detail={detail} />
      </CardContent>
    </CardV1>
  );
}

/** The session's quizzes on the admin page: title, kind and state badges, Edit and Grade links (v1). */
function AdminQuizzesCard({ sessionId, canAuthor }: { sessionId: number; canAuthor: boolean }) {
  const router = useRouter();
  const quizzes = useSessionQuizzes(sessionId, true);
  return (
    <CardV1>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <PenLine size={16} className="text-brand-teal-600" />
          <CardTitle className="text-base">Quizzes</CardTitle>
        </View>
        {/* V2-ONLY: v1's inline "+ Add quiz" form; v2 opens the new-quiz screen. */}
        {canAuthor ? (
          <ButtonV1 variant="outline" size="sm" onPress={() => router.push("/quiz/new")}>
            + Add quiz
          </ButtonV1>
        ) : null}
      </CardHeader>
      <CardContent>
        {quizzes.isPending ? (
          <TextV1 className="text-sm text-muted-foreground">Loading…</TextV1>
        ) : quizzes.isError ? (
          <View className="flex-col items-start gap-2">
            <TextV1 className="text-sm text-error-600 dark:text-error-400">
              Couldn't load this session's quizzes.
            </TextV1>
            <ButtonV1 variant="outline" size="sm" onPress={() => void quizzes.refetch()}>
              Try again
            </ButtonV1>
          </View>
        ) : quizzes.data.length === 0 ? (
          <TextV1 className="text-sm text-muted-foreground">
            No quizzes for this session yet.
          </TextV1>
        ) : (
          quizzes.data.map((q, i, all) => (
            <View
              key={q.id}
              className={`flex-row items-center justify-between gap-3 py-2 ${i === 0 ? "pt-0" : "border-t border-border"} ${i === all.length - 1 ? "pb-0" : ""}`}
            >
              <View className="min-w-0 flex-1">
                <View className="flex-row flex-wrap items-center gap-2">
                  <TextV1
                    numberOfLines={1}
                    className="shrink text-sm font-semibold text-brand-navy-900 dark:text-foreground"
                  >
                    {q.title}
                  </TextV1>
                  <Badge variant={q.kind === "ONLINE" ? "teal" : "outline"}>
                    {q.kind === "ONLINE" ? "Online" : "Paper"}
                  </Badge>
                  {q.kind === "ONLINE" ? (
                    <Badge variant={q.publishedAt ? "outline" : "warning"}>
                      {q.publishedAt ? "Published" : "Draft"}
                    </Badge>
                  ) : null}
                </View>
                <TextV1 className="text-xs text-muted-foreground">
                  {q.kind === "ONLINE"
                    ? `${q.questionCount} question${q.questionCount === 1 ? "" : "s"} · ${q.maxScore} pts`
                    : `Max score: ${q.maxScore}`}
                </TextV1>
              </View>
              <View className="shrink-0 flex-row gap-1">
                {canAuthor && q.kind === "ONLINE" ? (
                  <ButtonV1
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      router.push({ pathname: "/quiz/[id]/edit", params: { id: String(q.id) } })
                    }
                  >
                    Edit
                  </ButtonV1>
                ) : null}
                <ButtonV1
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: "/quiz/[id]/grade", params: { id: String(q.id) } })
                  }
                >
                  Grade
                </ButtonV1>
              </View>
            </View>
          ))
        )}
      </CardContent>
    </CardV1>
  );
}

/** V2-ONLY (spec 13 D10): how the leader's students did on the session's video quiz. */
function LeaderVideoResults({ sessionId }: { sessionId: number }) {
  const results = useVideoQuizResults(sessionId, true);
  // A video with no questions has nothing to report.
  if (results.data?.questionCount === 0) return null;
  return (
    <CardV1>
      <CardHeader>
        <CardTitle className="text-base">Video quiz results</CardTitle>
      </CardHeader>
      <CardContent>
        {results.isPending ? (
          <TextV1 className="text-sm text-muted-foreground">Loading…</TextV1>
        ) : results.isError ? (
          <View className="flex-col items-start gap-2">
            <TextV1 className="text-sm text-error-600 dark:text-error-400">
              Couldn't load the results.
            </TextV1>
            <ButtonV1 variant="outline" size="sm" onPress={() => void results.refetch()}>
              Try again
            </ButtonV1>
          </View>
        ) : results.data.rows.length === 0 ? (
          <TextV1 className="text-sm italic text-muted-foreground">No students to show yet.</TextV1>
        ) : (
          <DataTable
            rows={results.data.rows}
            rowKey={(r) => r.studentUserId}
            columns={[
              {
                key: "name",
                header: "Student",
                cell: (r) => r.studentName ?? `Student ${r.studentUserId}`,
              },
              {
                key: "answered",
                header: "Answered",
                cell: (r) => `${r.answeredCount}/${r.questionCount} answered`,
              },
              {
                key: "points",
                header: "Points",
                cell: (r) => `${r.earnedPoints}/${r.totalPoints} pts`,
              },
              {
                key: "done",
                header: "",
                cell: (r) =>
                  r.completedAt ? (
                    <Badge variant="success">Done</Badge>
                  ) : (
                    <Badge variant="outline">In progress</Badge>
                  ),
              },
            ]}
          />
        )}
      </CardContent>
    </CardV1>
  );
}

/** LEADER — v1 app/leader/sessions/[id]/page.tsx (B3-13). */
function LeaderSessionBody({
  data,
  refetch,
  isRefetching,
}: {
  data: SessionDetail;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const router = useRouter();
  return (
    <ShellFrame refreshing={isRefetching} onRefresh={refetch}>
      <View className="flex-col gap-4">
        {/* Org day and wall time from the server (X13). */}
        <PageTitle
          title={data.title}
          subtitle={`${formatWeekdayDay(data.dayKey)} · ${formatWallTime(data.startTime)}`}
        />
        {/* V2-ONLY entry: v1 leaders had no link to their attendance page; v1 admin's button. */}
        {data.canMarkAttendance ? (
          <ButtonV1
            className="self-start"
            onPress={() =>
              router.push({ pathname: "/session/[id]/attendance", params: { id: String(data.id) } })
            }
          >
            Mark attendance
          </ButtonV1>
        ) : null}
        {data.canMarkAttendance ? <LeaderQuizzesCard sessionId={data.id} /> : null}
        {data.canMarkAttendance ? <LeaderCheckInCard detail={data} /> : null}
        {data.youtubeUrl !== null ? <LeaderVideoResults sessionId={data.id} /> : null}
      </View>
    </ShellFrame>
  );
}

/**
 * ADMIN / SUPER / MENTOR — v1 app/admin/season/[code]/sessions/[id]/page.tsx:
 * title and when, Edit + Mark attendance, the info card, Quizzes, Video
 * questions, Check-in. A MENTOR reads the info card only (no attendance,
 * no edit: the server's flags).
 */
function AdminSessionBody({
  data,
  showConsole,
  refetch,
  isRefetching,
}: {
  data: SessionDetail;
  showConsole: boolean;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const router = useRouter();
  return (
    <ShellFrame refreshing={isRefetching} onRefresh={refetch}>
      <View className="flex-col gap-4">
        {/* Org day and wall time from the server (X13) — the device zone never re-reads startsAt. */}
        <PageTitle
          title={data.title}
          subtitle={`${formatDayKey(data.dayKey)} · ${formatWallTime(data.startTime)} · ${data.durationMinutes} min`}
        />
        {data.canManageCheckIn || data.canMarkAttendance ? (
          <View className="flex-row flex-wrap gap-2">
            {data.canManageCheckIn ? (
              <ButtonV1
                variant="outline"
                onPress={() =>
                  router.push({ pathname: "/session/[id]/edit", params: { id: String(data.id) } })
                }
              >
                Edit
              </ButtonV1>
            ) : null}
            {data.canMarkAttendance ? (
              <ButtonV1
                onPress={() =>
                  router.push({
                    pathname: "/session/[id]/attendance",
                    params: { id: String(data.id) },
                  })
                }
              >
                Mark attendance
              </ButtonV1>
            ) : null}
          </View>
        ) : null}

        {data.recurrenceGroupId || data.location || data.description || data.myAttendance ? (
          <CardV1>
            <CardContent className="flex-col gap-3 pt-6">
              {data.recurrenceGroupId ? (
                <Badge variant="outline" className="self-start">
                  Part of a recurring series
                </Badge>
              ) : null}
              {data.location ? (
                <View className="flex-row items-center gap-1.5">
                  <MapPin size={16} className="text-muted-foreground" />
                  <TextV1 className="text-sm">{data.location}</TextV1>
                </View>
              ) : null}
              {data.description ? (
                <TextV1 className="text-sm text-foreground">{data.description}</TextV1>
              ) : null}
              {data.myAttendance ? (
                <TextV1 className="text-sm text-muted-foreground">
                  {attendanceLine(data.myAttendance)}
                </TextV1>
              ) : null}
            </CardContent>
          </CardV1>
        ) : null}

        {data.canMarkAttendance ? (
          <AdminQuizzesCard sessionId={data.id} canAuthor={showConsole} />
        ) : null}

        <VideoSection detail={data} />

        {showConsole ? (
          <CheckInConsoleCard detail={data} />
        ) : data.canMarkAttendance ? (
          <LeaderCheckInCard detail={data} />
        ) : null}
      </View>
    </ShellFrame>
  );
}

function SessionDetailBody({ id }: { id: number }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const seasonAdminIds = useSessionStore((s) => s.scopes?.seasonAdminIds);
  const { data, isPending, isError, refetch, isRefetching } = useSessionDetail(id);

  if (isPending) {
    return (
      <ShellFrame>
        <RouteSkeleton />
      </ShellFrame>
    );
  }
  if (isError) {
    return (
      <ShellFrame>
        <RouteError onRetry={() => void refetch()} />
      </ShellFrame>
    );
  }

  if (role === "STUDENT") {
    return (
      <StudentSessionBody data={data} refetch={() => void refetch()} isRefetching={isRefetching} />
    );
  }
  if (role === "LEADER") {
    return (
      <LeaderSessionBody data={data} refetch={() => void refetch()} isRefetching={isRefetching} />
    );
  }

  // v1 showed the console only to an admin OF the season; the API also lets any
  // SUPER through (isAdminOfSeason), so the app narrows it (REG-79).
  const showConsole =
    data.canManageCheckIn && (role !== "SUPER" || (seasonAdminIds ?? []).includes(data.seasonId));

  return (
    <AdminSessionBody
      data={data}
      showConsole={showConsole}
      refetch={() => void refetch()}
      isRefetching={isRefetching}
    />
  );
}

export default function SessionDetailScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = parsePositiveInt(raw);
  if (id === null) {
    return (
      <ShellFrame>
        <EmptyState title="Not found" description="That session doesn't exist." />
      </ShellFrame>
    );
  }
  return <SessionDetailBody id={id} />;
}
