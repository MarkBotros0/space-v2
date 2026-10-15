import { useRouter } from "expo-router";
import { ChevronRight, PenLine } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { QuizSummary, StudentQuizResult } from "@space/shared";

import { Eyebrow } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { cn } from "../../src/design/lib/cn";
import { iconWithClassName } from "../../src/design/lib/icon";
import { shadowStyle } from "../../src/design/lib/shadow";
import { Badge, EmptyState as EmptyStateV1, ProgressRing, Text as TextV1 } from "../../src/design/ui";
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
iconWithClassName(ChevronRight);

/** v1 QuizStatus: the score, or the attempt's badge. */
function StudentQuizStatus({ row }: { row: StudentQuizResult }) {
  if (row.score !== null) {
    const pct = row.maxScore > 0 ? Math.round((row.score / row.maxScore) * 100) : 0;
    return (
      <View className="items-end">
        <TextV1 className="text-lg font-black text-brand-navy-900 dark:text-foreground">
          {String(row.score)}
          <TextV1 className="text-sm font-normal text-muted-foreground">{`/${row.maxScore}`}</TextV1>
        </TextV1>
        <TextV1 className="text-xs text-muted-foreground">{`${pct}%`}</TextV1>
      </View>
    );
  }
  if (row.kind === "PAPER") return <Badge variant="outline">Pending</Badge>;
  if (row.attemptStatus === null) return <Badge variant="teal">Take quiz</Badge>;
  if (row.attemptStatus === "IN_PROGRESS") return <Badge variant="warning">Resume</Badge>;
  return <Badge variant="outline">Awaiting grading</Badge>;
}

function StudentQuizRow({ row }: { row: StudentQuizResult }) {
  const router = useRouter();
  const online = row.kind === "ONLINE";
  const body = (
    <>
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <TextV1 className="text-sm font-bold text-brand-navy-900 dark:text-foreground">{row.title}</TextV1>
          {row.sessionTitle ? (
            <TextV1 className="mt-0.5 text-xs text-muted-foreground">
              {row.sessionDate ? `${row.sessionTitle} · ${formatDate(row.sessionDate)}` : row.sessionTitle}
            </TextV1>
          ) : null}
        </View>
        <View className="shrink-0 flex-row items-center gap-1">
          <StudentQuizStatus row={row} />
          {online ? <ChevronRight size={16} className="text-muted-foreground" /> : null}
        </View>
      </View>
      {row.notes ? (
        <TextV1 className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{row.notes}</TextV1>
      ) : null}
      {row.gradedAt ? (
        <TextV1 className="mt-2 text-[10px] text-muted-foreground/70">{`Graded ${formatDate(row.gradedAt)}`}</TextV1>
      ) : null}
    </>
  );
  const box = "rounded-2xl border border-border bg-card px-4 py-4";
  // v1: a PAPER row is a plain card, not a link.
  if (!online) {
    return (
      <View className={box} style={shadowStyle("soft")}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push({ pathname: "/quiz/[id]", params: { id: String(row.quizId) } })}
      className={cn(box, "active:border-brand-teal-500")}
      style={shadowStyle("soft")}
    >
      {body}
    </Pressable>
  );
}

/** v1 app/student/quizzes/page.tsx: hero always, then the rows (B2-15). */
function StudentQuizzes({ seasonId }: { seasonId: number | null }) {
  const { data, isPending, isError, refetch, isRefetching } = useStudentQuizList(seasonId);

  const handleRefresh = () => {
    if (seasonId !== null) void refetch();
  };

  // v1 shows the hero over an empty list when there is no season; v2 never
  // asks the API without one (the hook is gated).
  const rows: StudentQuizResult[] = seasonId === null ? [] : (data ?? []);
  // Scored rows only, so an unattempted quiz cannot drag the average down.
  const scored = rows.filter((r) => r.score !== null && r.maxScore > 0);
  const average =
    scored.length === 0
      ? null
      : Math.round((scored.reduce((sum, r) => sum + (r.score as number) / r.maxScore, 0) / scored.length) * 100);

  let list: ReactNode;
  if (seasonId !== null && isPending) list = <RouteSkeleton />;
  else if (seasonId !== null && isError) list = <RouteError onRetry={() => void refetch()} />;
  else if (rows.length === 0)
    list = (
      <EmptyStateV1 icon={PenLine} title="No quizzes yet" description="Your quiz results will appear here once graded." />
    );
  else
    list = (
      <View className="flex-col gap-3">
        {rows.map((row) => (
          <StudentQuizRow key={`${row.kind}-${row.quizId}`} row={row} />
        ))}
      </View>
    );

  return (
    <ShellFrame onRefresh={handleRefresh} refreshing={isRefetching}>
      <View className="flex-col gap-3">
        <View className="rounded-2xl border border-border bg-card p-5" style={shadowStyle("soft")}>
          <View className="flex-row items-center gap-5">
            <ProgressRing
              value={average ?? 0}
              label={average !== null ? `Average quiz score ${average}%` : "No graded quizzes yet"}
            >
              <TextV1 className="text-2xl font-black text-brand-navy-900 dark:text-foreground">
                {average !== null ? `${average}%` : "—"}
              </TextV1>
              <Eyebrow className="mt-1">avg</Eyebrow>
            </ProgressRing>
            <View className="min-w-0 flex-1">
              <Eyebrow tone="teal">Quiz performance</Eyebrow>
              <TextV1 className="mt-1 text-lg font-black text-brand-navy-900 dark:text-foreground">Average score</TextV1>
              <TextV1 className="text-xs text-muted-foreground">
                {`${scored.length} graded · ${rows.length - scored.length} pending`}
              </TextV1>
            </View>
          </View>
        </View>
        {list}
      </View>
    </ShellFrame>
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
