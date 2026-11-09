import type { ReactNode } from "react";
import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, Text } from "../../design/ui";
import { useStudentAssignments } from "../../hooks/use-assignments";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useStudentQuizList } from "../../hooks/use-quizzes";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { useSessionStore } from "../../store/session";
import { submittedSections, todoGroups, type WorkRow } from "./work-model";
import { WorkListRow, WorkLoadingRow } from "./work-row";

/*
 * The student's work on one screen (owner, 2026-11-07: To do and Submitted
 * merged): what still needs doing on top, most urgent first, then the history
 * of what they handed in, newest first, its grading said in words.
 */

const TITLE = { title: "My work", subtitle: "What to do, and what you handed in" } as const;
/** No limit: a quiz's subtitle carries the leader's note, which is not cut off at two lines. */
const FULL_SUBTITLE_LINES = 0;

function Group({ header, rows }: { header: string; rows: WorkRow[] }) {
  return (
    <GroupedList header={header}>
      {rows.map((row) => (
        <WorkListRow key={row.key} row={row} subtitleLines={FULL_SUBTITLE_LINES} />
      ))}
    </GroupedList>
  );
}

/** Mounted only with a season, so a student who has none sends no request at all. */
function useSeasonWork(seasonId: number) {
  const assignments = useStudentAssignments(seasonId);
  const quizzes = useStudentQuizList(seasonId);
  // Asked only for the org's today; without it the grouping falls back to the
  // device's day, and overdue still comes from the server's flag.
  const dash = useStudentDashboard(seasonId);
  return {
    assignments,
    quizzes,
    todayOrgDay: dash.data?.todayOrgDay ?? deviceTodayKey(),
    refresh: () => {
      void assignments.refetch();
      void quizzes.refetch();
      void dash.refetch();
    },
    refreshing: assignments.isRefetching || quizzes.isRefetching || dash.isRefetching,
  };
}

function CaughtUp() {
  return (
    <GroupedList header="To do">
      <View className="min-h-[52px] justify-center px-4 py-3">
        <Text variant="subhead" className="text-muted-foreground">
          You're all caught up. New assignments and quizzes show up here.
        </Text>
      </View>
    </GroupedList>
  );
}

function SeasonWork({ seasonId }: { seasonId: number }) {
  const work = useSeasonWork(seasonId);
  const { assignments, quizzes } = work;

  let body: ReactNode;
  if (assignments.isPending) body = <RouteSkeleton />;
  else if (assignments.isError) body = <RouteError onRetry={() => void assignments.refetch()} />;
  else {
    const groups = todoGroups(assignments.data, quizzes.data ?? [], work.todayOrgDay);
    const done = submittedSections(assignments.data, quizzes.data ?? []);
    body = (
      <View className="flex-col gap-6">
        {groups.map((g) => (
          <Group key={g.key} header={g.header} rows={g.rows} />
        ))}
        {quizzes.isPending ? (
          <GroupedList header="Quizzes to take">
            <WorkLoadingRow />
          </GroupedList>
        ) : null}
        {groups.length === 0 && !quizzes.isPending ? <CaughtUp /> : null}
        {quizzes.isError ? (
          <InlineError message="Couldn't load your quizzes." onRetry={() => void quizzes.refetch()} />
        ) : null}
        {done.assignments.length > 0 ? <Group header="Assignments handed in" rows={done.assignments} /> : null}
        {done.quizzes.length > 0 ? <Group header="Quizzes taken" rows={done.quizzes} /> : null}
      </View>
    );
  }

  return (
    <Screen {...TITLE} onRefresh={work.refresh} refreshing={work.refreshing}>
      {body}
    </Screen>
  );
}

/**
 * The student's My work tab (/work). Also what a student sees at /assignments
 * and /quizzes, in place on the stack (P2-11).
 */
export function WorkScreen() {
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  if (seasonId === null) {
    return (
      <Screen {...TITLE}>
        <EmptyState
          icon={NAV_ICONS.assignments}
          title="No active season"
          description="You don't have an active season right now, so there is no work to show."
        />
      </Screen>
    );
  }
  return <SeasonWork seasonId={seasonId} />;
}
