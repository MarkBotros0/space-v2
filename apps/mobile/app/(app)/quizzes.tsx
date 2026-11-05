import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { QuizSummary } from "@space/shared";

import { NAV_ICONS } from "../../src/design/icons/nav-icon";
import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { Badge, Button, EmptyState, Text } from "../../src/design/ui";
import { useQuizList } from "../../src/hooks/use-quizzes";
import { useCurrentSeasonId, useSeasonDetail } from "../../src/hooks/use-seasons";
import { formatDate } from "../../src/lib/format";
import { WorkScreen } from "../../src/screens/work/work-screen";
import { useSessionStore } from "../../src/store/session";

/**
 * Three v1 pages collapse into this one: /student/quizzes, /leader/quizzes and
 * /admin/quizzes (Decision D1 — one route per destination, role branches
 * inside). The branch is on role, and each branch calls its own hook, because
 * GET /quizzes returns a different row shape per role. A student's quizzes are
 * in the Work tab; an old link shows it here on the stack, with its Back bar,
 * never a replace to a tab (P2-11).
 */

/** v1's three-way badge over the server's counts (C4, D10). */
function GradedBadge({ row }: { row: QuizSummary }) {
  if (row.studentCount > 0 && row.gradedCount >= row.studentCount)
    return <Badge variant="success">Done</Badge>;
  if (row.gradedCount > 0) return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

/** v1 order: session date, newest first; quizzes without a session last (B3-10). */
function bySessionDate(a: QuizSummary, b: QuizSummary): number {
  if (a.sessionDate === b.sessionDate) return b.id - a.id;
  if (a.sessionDate === null) return 1;
  if (b.sessionDate === null) return -1;
  return b.sessionDate.localeCompare(a.sessionDate);
}

/** v1's quiz card (leader and admin lists share it): title, session · date · Max, graded count and badge. */
function QuizSummaryRow({
  row,
  onPress,
  badge,
}: {
  row: QuizSummary;
  onPress: () => void;
  badge?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="flex-row items-center justify-between gap-4 rounded-group bg-surface dark:border dark:border-separator px-4 py-4"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-bold text-brand-navy-900 dark:text-foreground">
          {row.title}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {`${row.sessionTitle !== null ? `${row.sessionTitle} · ${formatDate(row.sessionDate)}` : "No session"} · Max ${row.maxScore} pts`}
        </Text>
      </View>
      <View className="shrink-0 flex-row items-center gap-2">
        <Text className="text-xs text-muted-foreground">{`${row.gradedCount}/${row.studentCount} graded`}</Text>
        {badge ?? <GradedBadge row={row} />}
      </View>
    </Pressable>
  );
}

/**
 * LEADER — v1 app/leader/quizzes/page.tsx. Every row opens grading (spec 12
 * D12: the flat route has no orphan "#" links).
 */
function LeaderQuizzes() {
  const router = useRouter();
  const current = useCurrentSeasonId();
  const seasonId = current.seasonId;
  const { data, isPending, isError, refetch, isRefetching } = useQuizList(seasonId);
  const rows = [...(data?.items ?? [])].sort(bySessionDate);

  let body: ReactNode;
  if (current.isPending || (seasonId !== null && isPending)) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (seasonId !== null && isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (rows.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.quizzes}
        title="No quizzes yet"
        description="Quizzes created by your admin will appear here."
      />
    );
  else
    body = (
      <View className="flex-col gap-3">
        {rows.map((row) => (
          <QuizSummaryRow
            key={row.id}
            row={row}
            onPress={() =>
              router.push({ pathname: "/quiz/[id]/grade", params: { id: String(row.id) } })
            }
          />
        ))}
      </View>
    );

  return (
    <ShellFrame
      refreshing={isRefetching}
      onRefresh={() => (seasonId !== null ? void refetch() : current.refetch())}
    >
      <View className="flex-col gap-4">
        <PageTitle title="Quizzes" subtitle="Grade paper quizzes for your group" />
        {body}
      </View>
    </ShellFrame>
  );
}

/**
 * ADMIN / SUPER — v1 app/admin/quizzes/page.tsx: "Quizzes", "All quizzes for
 * {season}", a "Go to sessions" link and the shared quiz cards. V2-ONLY kept:
 * "New quiz" (v1 created quizzes only from a session's card), and a draft
 * ONLINE quiz opens its builder, not the grade sheet.
 */
function StaffQuizzes() {
  const router = useRouter();
  // Ruling X8: a staff season comes from Plan 4's hook — never
  // scopes.activeSeasonId, which is the student-profile pointer and always
  // null for staff.
  const current = useCurrentSeasonId();
  const seasonId = current.seasonId;
  const season = useSeasonDetail(seasonId);
  const role = useSessionStore((s) => s.user?.role ?? null);
  const canAuthor = role === "ADMIN" || role === "SUPER";
  const { data, isPending, isError, refetch, isRefetching } = useQuizList(seasonId);
  const items = data?.items ?? [];

  const handleRefresh = () => {
    if (seasonId !== null) void refetch();
    else current.refetch();
  };

  let body: ReactNode;
  if (current.isPending || (seasonId !== null && isPending)) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (seasonId === null)
    body = <EmptyState title="No season" description="You aren't attached to a season yet." />;
  else if (isError) body = <RouteError onRetry={() => void refetch()} />;
  else if (items.length === 0)
    body = (
      <EmptyState
        icon={NAV_ICONS.quizzes}
        title="No quizzes yet"
        description="Open a session from the calendar, then use the Quizzes card to add one."
      />
    );
  else
    body = (
      <View className="flex-col gap-3">
        {[...items].sort(bySessionDate).map((row) => {
          const draft = row.kind === "ONLINE" && row.publishedAt === null;
          return (
            <QuizSummaryRow
              key={row.id}
              row={row}
              badge={draft ? <Badge variant="warning">Draft</Badge> : undefined}
              onPress={() =>
                router.push(
                  canAuthor && draft
                    ? { pathname: "/quiz/[id]/edit", params: { id: String(row.id) } }
                    : { pathname: "/quiz/[id]/grade", params: { id: String(row.id) } },
                )
              }
            />
          );
        })}
      </View>
    );

  return (
    <ShellFrame onRefresh={handleRefresh} refreshing={isRefetching}>
      <View className="flex-col gap-4">
        <PageTitle
          title="Quizzes"
          subtitle={
            season.data
              ? `All quizzes for ${season.data.title}`
              : seasonId === null
                ? "No season found"
                : undefined
          }
        />
        {seasonId !== null ? (
          <View className="flex-row flex-wrap gap-2">
            {canAuthor ? <Button onPress={() => router.push("/quiz/new")}>New quiz</Button> : null}
            <Button variant="outline" onPress={() => router.push("/calendar")}>
              Go to sessions
            </Button>
          </View>
        ) : null}
        {body}
      </View>
    </ShellFrame>
  );
}

export default function QuizzesScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);

  if (role === "STUDENT") return <WorkScreen />;
  if (role === "LEADER") return <LeaderQuizzes />;
  if (role === "ADMIN" || role === "SUPER") {
    return <StaffQuizzes />;
  }
  // MENTOR has no quiz access anywhere in v1 and /quizzes is not in the mentor
  // nav (spec D11). Confirmed as deliberate rather than widened here.
  return (
    <ShellFrame>
      <EmptyState
        icon={NAV_ICONS.quizzes}
        title="Quizzes"
        description="This screen isn't available for your role."
      />
    </ShellFrame>
  );
}
