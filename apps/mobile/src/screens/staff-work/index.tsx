/**
 * The staff Work tab (owner, 2026-11-07; the LEADER's too since 2026-11-14): the
 * season's assignments and quizzes in one place, switched by a segmented control,
 * with New assignment and New quiz on top for an author. An assignment with essays
 * waiting says "N to review" and comes first; the essay opens from its student on the
 * assignment's page, never from a separate list. Each row says its state in words: Overdue / Due …,
 * submitted counts. Quizzes split into Drafts and Published (`staff-quiz-list.tsx`).
 */
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import type { StaffAssignmentListItem } from "@space/shared";

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
import { formatDayKey, formatDistanceOnly } from "../../lib/format";
import { StaffQuizList } from "./staff-quiz-list";

type Tab = "assignments" | "quizzes";

function dueWords(a: StaffAssignmentListItem): string {
  if (a.dueAt === null || a.dueOrgDay === null) return "No due date";
  if (a.isOverdue) return `Due ${formatDayKey(a.dueOrgDay)}`;
  return `Due in ${formatDistanceOnly(a.dueAt)}`;
}

function assignmentChip(a: StaffAssignmentListItem): ReactNode {
  const tone = a.dueAt === null ? "neutral" : a.isOverdue ? "warn" : "neutral";
  return <StatusChip tone={tone} label={dueWords(a)} />;
}

/** Something waiting on the caller first, then the list's own order (due date). */
function waitingFirst(rows: StaffAssignmentListItem[]): StaffAssignmentListItem[] {
  return [...rows.filter((a) => a.pendingReviewCount > 0), ...rows.filter((a) => a.pendingReviewCount === 0)];
}

export function StaffWork({ canAuthor, initialTab }: { canAuthor: boolean; initialTab?: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab ?? "assignments");
  // A tab already open follows a new link to it (Home's tiles).
  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);
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
    const rows = waitingFirst(assignments.data ?? []);
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
            trailing={
              <View className="flex-row flex-wrap gap-1.5">
                {a.pendingReviewCount > 0 ? (
                  <StatusChip tone="info" label={`${a.pendingReviewCount} to review`} />
                ) : null}
                {assignmentChip(a)}
              </View>
            }
            trailingLabel={[a.pendingReviewCount > 0 ? `${a.pendingReviewCount} to review` : null, dueWords(a)]
              .filter(Boolean)
              .join(", ")}
            trailingPlacement="below"
            chevron
            onPress={() => router.push({ pathname: "/assignment/[id]", params: { id: String(a.id) } })}
          />
        ))}
      </GroupedList>
    );
  } else {
    body = quizzes.isPending ? (
      <RouteSkeleton />
    ) : quizzes.isError ? (
      <RouteError onRetry={() => void quizzes.refetch()} />
    ) : (
      <StaffQuizList rows={quizzes.data?.items ?? []} canAuthor={canAuthor} />
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
