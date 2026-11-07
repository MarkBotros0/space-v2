/**
 * ADMIN and SUPER's Work tab (owner, 2026-11-07): the season's assignments and
 * quizzes in one place, switched by a segmented control, with New assignment
 * and New quiz on top. Each row says its state in words: Overdue / Due …,
 * submitted counts; Draft / Done / Partly graded / Not graded.
 */
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { View } from "react-native";
import type { QuizSummary, StaffAssignmentListItem } from "@space/shared";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { GroupedList, ListRow } from "../../design/ui/grouped-list";
import { SegmentedControl } from "../../design/ui/segmented-control";
import { StatusChip } from "../../design/ui/status-chip";
import { useStaffAssignments } from "../../hooks/use-assignments";
import { useQuizList } from "../../hooks/use-quizzes";
import { useCurrentSeasonId, useSeasonDetail } from "../../hooks/use-seasons";
import { formatDate, formatDayKey, formatDistanceOnly } from "../../lib/format";
import { bySessionDate } from "../../lib/quiz-order";

type Tab = "assignments" | "quizzes";

function assignmentChip(a: StaffAssignmentListItem): ReactNode {
  if (a.dueAt === null || a.dueOrgDay === null) return <StatusChip tone="neutral" label="No due date" />;
  if (a.isOverdue) return <StatusChip tone="warn" label={`Due ${formatDayKey(a.dueOrgDay)}`} />;
  return <StatusChip tone="info" label={`Due in ${formatDistanceOnly(a.dueAt)}`} />;
}

function quizChip(q: QuizSummary): ReactNode {
  if (q.kind === "ONLINE" && q.publishedAt === null) return <StatusChip tone="warn" label="Draft" />;
  if (q.studentCount > 0 && q.gradedCount >= q.studentCount) return <StatusChip tone="ok" label="Graded" />;
  if (q.gradedCount > 0) return <StatusChip tone="info" label="Partly graded" />;
  return <StatusChip tone="neutral" label="Not graded" />;
}

export function StaffWork({ canAuthor }: { canAuthor: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("assignments");
  const current = useCurrentSeasonId();
  const seasonId = current.seasonId;
  const season = useSeasonDetail(seasonId);
  const assignments = useStaffAssignments(seasonId);
  const quizzes = useQuizList(seasonId);

  const refresh = () => {
    if (seasonId === null) return current.refetch();
    void assignments.refetch();
    void quizzes.refetch();
  };

  let body: ReactNode;
  if (current.isPending) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (seasonId === null)
    body = <EmptyState title="No season" description="You aren't attached to a season yet." />;
  else if (tab === "assignments") {
    const rows = assignments.data ?? [];
    body = assignments.isPending ? (
      <RouteSkeleton />
    ) : assignments.isError ? (
      <RouteError onRetry={() => void assignments.refetch()} />
    ) : rows.length === 0 ? (
      <EmptyState
        icon={NAV_ICONS.assignments}
        title="No assignments yet"
        description="Create an assignment so students have something to submit."
      />
    ) : (
      <GroupedList>
        {rows.map((a) => (
          <ListRow
            key={a.id}
            title={a.title}
            titleLines={2}
            subtitle={`${a.submissionCount} of ${a.expectedCount} submitted`}
            trailing={assignmentChip(a)}
            trailingPlacement="below"
            chevron
            onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
          />
        ))}
      </GroupedList>
    );
  } else {
    const rows = [...(quizzes.data?.items ?? [])].sort(bySessionDate);
    body = quizzes.isPending ? (
      <RouteSkeleton />
    ) : quizzes.isError ? (
      <RouteError onRetry={() => void quizzes.refetch()} />
    ) : rows.length === 0 ? (
      <EmptyState icon={NAV_ICONS.quizzes} title="No quizzes yet" description="Add a quiz for a session." />
    ) : (
      <GroupedList>
        {rows.map((q) => {
          const draft = q.kind === "ONLINE" && q.publishedAt === null;
          return (
            <ListRow
              key={q.id}
              title={q.title}
              titleLines={2}
              subtitle={`${q.sessionTitle !== null ? `${q.sessionTitle} · ${formatDate(q.sessionDate)}` : "No session"} · ${q.gradedCount} of ${q.studentCount} graded`}
              trailing={quizChip(q)}
              trailingPlacement="below"
              chevron
              onPress={() =>
                router.push(
                  canAuthor && draft
                    ? { pathname: "/quiz/[id]/edit", params: { id: String(q.id) } }
                    : { pathname: "/quiz/[id]/grade", params: { id: String(q.id) } },
                )
              }
            />
          );
        })}
      </GroupedList>
    );
  }

  return (
    <Screen
      title="Work"
      subtitle={season.data?.title}
      onRefresh={refresh}
      refreshing={assignments.isRefetching || quizzes.isRefetching}
    >
      <View className="flex-col gap-4">
        {canAuthor && seasonId !== null ? (
          <View className="flex-row flex-wrap gap-2">
            <Button onPress={() => router.push("/assignment/new")}>New assignment</Button>
            <Button variant="secondary" onPress={() => router.push("/quiz/new")}>
              New quiz
            </Button>
          </View>
        ) : null}
        <SegmentedControl
          options={[
            { value: "assignments", label: "Assignments" },
            { value: "quizzes", label: "Quizzes" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
        {body}
      </View>
    </Screen>
  );
}
