import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import type { QuizSummary, StudentQuizResult } from "@space/shared";

import { useQuizList, useStudentQuizList } from "../../src/hooks/use-quizzes";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { formatDate } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * Three v1 pages collapse into this one: /student/quizzes, /leader/quizzes and
 * /admin/quizzes (Decision D1 — one route per destination, role branches
 * inside). The branch is on role, and each branch calls its own hook, because
 * GET /quizzes returns a different row shape per role.
 */
function studentStatus(row: StudentQuizResult): string {
  if (row.kind === "PAPER") {
    // A paper quiz is only in this list because a grade row exists (R36), so a
    // null score here means the grader saved a row with no mark — rare, but
    // real, and "Pending" is the honest label.
    return row.score === null ? "Pending" : `${row.score} / ${row.maxScore}`;
  }
  if (row.attemptStatus === null) return "Not started";
  if (row.attemptStatus === "IN_PROGRESS") return "In progress";
  if (row.attemptStatus === "SUBMITTED") return "Waiting to be marked";
  return row.score === null ? "Graded" : `${row.score} / ${row.maxScore}`;
}

function StudentQuizzes({ seasonId }: { seasonId: number | null }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, isPending, isError, refetch, isRefetching } = useStudentQuizList(seasonId);

  const handleRefresh = () => {
    if (seasonId !== null) void refetch();
  };

  if (seasonId === null) {
    return (
      <Screen edges={["top", "left", "right"]}>
        <EmptyState
          title="No active season"
          message="You don't have an active season right now, so there are no quizzes to show."
        />
      </Screen>
    );
  }
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
        <ErrorState message="Couldn't load your quizzes." onRetry={refetch} />
      </Screen>
    );
  }

  // Scored rows only, so an unattempted quiz cannot drag the average down.
  const scored = data.filter((r) => r.score !== null && r.maxScore > 0);
  const average =
    scored.length === 0
      ? null
      : Math.round(
          (scored.reduce((sum, r) => sum + (r.score as number) / r.maxScore, 0) / scored.length) *
            100,
        );

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching} scroll>
      {average !== null ? (
        <Card style={{ marginBottom: theme.spacing.sm }}>
          <Text variant="heading">{`${average}% average`}</Text>
          <Text variant="label" color={theme.colors.neutral[600]}>
            {`Across ${scored.length} graded ${scored.length === 1 ? "quiz" : "quizzes"}`}
          </Text>
        </Card>
      ) : null}

      {data.length === 0 ? (
        <EmptyState title="No quizzes" message="This season doesn't have any quizzes for you yet." />
      ) : (
        data.map((row) => (
          <Pressable
            key={`${row.kind}-${row.quizId}`}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/quiz/[id]", params: { id: String(row.quizId) } })
            }
          >
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">{row.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {`${row.sessionTitle ?? "No session"} · ${studentStatus(row)}`}
              </Text>
              {row.notes ? <Text variant="body">{row.notes}</Text> : null}
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

function staffStatus(row: QuizSummary): string {
  if (row.kind === "PAPER") return `Paper · ${row.gradedCount}/${row.studentCount} graded`;
  const state = row.publishedAt === null ? "Draft" : `${row.gradedCount}/${row.studentCount} graded`;
  return `Online · ${state} · ${row.questionCount} question${row.questionCount === 1 ? "" : "s"}`;
}

function StaffQuizzes() {
  const theme = useTheme();
  const router = useRouter();
  // Ruling X8: a staff season comes from Plan 4's hook — never
  // scopes.activeSeasonId, which is the student-profile pointer and always
  // null for staff.
  const current = useCurrentSeasonId();
  const seasonId = current.seasonId;
  const role = useSessionStore((s) => s.user?.role ?? null);
  const canAuthor = role === "ADMIN" || role === "SUPER";
  const { data, isPending, isError, refetch, isRefetching } = useQuizList(seasonId);

  const handleRefresh = () => {
    if (seasonId !== null) void refetch();
    else current.refetch();
  };

  return (
    <Screen edges={["top", "left", "right"]} onRefresh={handleRefresh} refreshing={isRefetching} scroll>
      {canAuthor && seasonId !== null ? (
        <Button
          title="New quiz"
          style={{ marginBottom: theme.spacing.sm }}
          onPress={() => router.push("/quiz/new")}
        />
      ) : null}
      {current.isPending ? (
        <LoadingState />
      ) : current.isError ? (
        <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />
      ) : seasonId === null ? (
        <EmptyState title="No season" message="You aren't attached to a season yet." />
      ) : isPending ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState message="Couldn't load quizzes." onRetry={refetch} />
      ) : data.items.length === 0 ? (
        <EmptyState title="No quizzes" message="This season doesn't have any quizzes yet." />
      ) : (
        data.items.map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            onPress={() =>
              router.push(
                canAuthor && row.kind === "ONLINE" && row.publishedAt === null
                  ? { pathname: "/quiz/[id]/edit", params: { id: String(row.id) } }
                  : { pathname: "/quiz/[id]/grade", params: { id: String(row.id) } },
              )
            }
          >
            <Card style={{ marginBottom: theme.spacing.sm }}>
              <Text variant="heading">{row.title}</Text>
              <Text variant="label" color={theme.colors.neutral[600]}>
                {staffStatus(row)}
              </Text>
              <Text variant="caption" color={theme.colors.neutral[600]}>
                {row.sessionDate ? formatDate(row.sessionDate) : "No session"}
              </Text>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

export default function QuizzesScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  // A student's season IS the pinned profile pointer.
  const studentSeasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);

  if (role === "STUDENT") return <StudentQuizzes seasonId={studentSeasonId} />;
  if (role === "LEADER" || role === "ADMIN" || role === "SUPER") {
    return <StaffQuizzes />;
  }
  // MENTOR has no quiz access anywhere in v1 and /quizzes is not in the mentor
  // nav (spec D11). Confirmed as deliberate rather than widened here.
  return (
    <Screen edges={["top", "left", "right"]}>
      <EmptyState title="Quizzes" message="This screen isn't available for your role." />
    </Screen>
  );
}
