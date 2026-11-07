import type { ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, StatTile } from "../../design/ui";
import { useStudentAssignments } from "../../hooks/use-assignments";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useStudentQuizList } from "../../hooks/use-quizzes";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { useSessionStore } from "../../store/session";
import { submittedSections, todoGroups, type WorkRow } from "./work-model";
import { WorkListRow, WorkLoadingRow } from "./work-row";

/*
 * The student's work, as two tabs (owner, 2026-11-06 — "very clear for the
 * students"): To do (what still needs doing, most urgent first) and Submitted
 * (what was handed in, and where its grading stands). Each tab answers one
 * question; there is no segmented control to miss.
 */

const TODO_TITLE = { title: "To do", subtitle: "Assignments and quizzes still to finish" } as const;
const SUBMITTED_TITLE = {
  title: "Submitted",
  subtitle: "What you handed in, and its grading",
} as const;
const NO_VALUE = "—";
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

function SeasonTodo({ seasonId }: { seasonId: number }) {
  const router = useRouter();
  const work = useSeasonWork(seasonId);
  const { assignments, quizzes } = work;

  let body: ReactNode;
  if (assignments.isPending) body = <RouteSkeleton />;
  else if (assignments.isError) body = <RouteError onRetry={() => void assignments.refetch()} />;
  else {
    const groups = todoGroups(assignments.data, quizzes.data ?? [], work.todayOrgDay);
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
        {groups.length === 0 && !quizzes.isPending ? (
          <EmptyState
            icon={NAV_ICONS.todo}
            title="You're all caught up"
            description="Nothing to hand in right now. New assignments and quizzes show up here."
            action={{ label: "See what you submitted", onPress: () => router.push("/submitted") }}
          />
        ) : null}
        {quizzes.isError ? (
          <InlineError
            message="Couldn't load your quizzes."
            onRetry={() => void quizzes.refetch()}
          />
        ) : null}
      </View>
    );
  }

  return (
    <Screen {...TODO_TITLE} onRefresh={work.refresh} refreshing={work.refreshing}>
      {body}
    </Screen>
  );
}

function SeasonSubmitted({ seasonId }: { seasonId: number }) {
  const work = useSeasonWork(seasonId);
  const { assignments, quizzes } = work;

  let body: ReactNode;
  if (assignments.isPending) body = <RouteSkeleton />;
  else if (assignments.isError) body = <RouteError onRetry={() => void assignments.refetch()} />;
  else {
    const s = submittedSections(assignments.data, quizzes.data ?? []);
    const nothing = s.assignments.length === 0 && s.quizzes.length === 0 && !quizzes.isPending;
    body = nothing ? (
      <EmptyState
        icon={NAV_ICONS.submitted}
        title="Nothing submitted yet"
        description="Assignments you hand in and quizzes you take show up here, with their grading."
      />
    ) : (
      <View className="flex-col gap-6">
        <View className="flex-row flex-wrap gap-3">
          <StatTile label="Waiting for review" value={s.stats.waiting} />
          <StatTile label="Reviewed" value={s.stats.reviewed} />
          <StatTile
            label="Quiz average"
            value={s.stats.quizAverage === null ? NO_VALUE : `${s.stats.quizAverage}%`}
          />
        </View>
        {s.assignments.length > 0 ? <Group header="Assignments" rows={s.assignments} /> : null}
        {quizzes.isPending ? (
          <GroupedList header="Quizzes">
            <WorkLoadingRow />
          </GroupedList>
        ) : s.quizzes.length > 0 ? (
          <Group header="Quizzes" rows={s.quizzes} />
        ) : null}
        {quizzes.isError ? (
          <InlineError
            message="Couldn't load your quizzes."
            onRetry={() => void quizzes.refetch()}
          />
        ) : null}
      </View>
    );
  }

  return (
    <Screen {...SUBMITTED_TITLE} onRefresh={work.refresh} refreshing={work.refreshing}>
      {body}
    </Screen>
  );
}

function NoSeason({ title }: { title: typeof TODO_TITLE | typeof SUBMITTED_TITLE }) {
  return (
    <Screen {...title}>
      <EmptyState
        icon={NAV_ICONS.assignments}
        title="No active season"
        description="You don't have an active season right now, so there is no work to show."
      />
    </Screen>
  );
}

/**
 * The student's To do tab (/work). Also what a student sees at /assignments
 * and /quizzes, in place on the stack (P2-11).
 */
export function WorkScreen() {
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  if (seasonId === null) return <NoSeason title={TODO_TITLE} />;
  return <SeasonTodo seasonId={seasonId} />;
}

/** The student's Submitted tab (/submitted). */
export function SubmittedScreen() {
  const seasonId = useSessionStore((s) => s.scopes?.activeSeasonId ?? null);
  if (seasonId === null) return <NoSeason title={SUBMITTED_TITLE} />;
  return <SeasonSubmitted seasonId={seasonId} />;
}
