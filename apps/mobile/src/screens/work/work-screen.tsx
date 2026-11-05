import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { NAV_ICONS } from "../../design/icons/nav-icon";
import { InlineError, RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { EmptyState, GroupedList, ListRow, SegmentedControl, StatTile } from "../../design/ui";
import { useStudentAssignments } from "../../hooks/use-assignments";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useStudentQuizList } from "../../hooks/use-quizzes";
import { deviceTodayKey } from "../../lib/calendar-grid";
import { useSessionStore } from "../../store/session";
import { workSections, type WorkRow } from "./work-model";
import { WorkListRow, WorkLoadingRow } from "./work-row";

const TITLE = { title: "Work", subtitle: "Your current season" } as const;
const NO_VALUE = "—";
/** No limit: a quiz's subtitle carries the leader's note, which is not cut off at two lines. */
const FULL_SUBTITLE_LINES = 0;

type Segment = "todo" | "done";

function DoneGroup({ header, rows }: { header: string; rows: WorkRow[] }) {
  if (rows.length === 0) return null;
  return (
    <GroupedList header={header}>
      {rows.map((row, i) => (
        <WorkListRow key={row.key} row={row} index={i} subtitleLines={FULL_SUBTITLE_LINES} />
      ))}
    </GroupedList>
  );
}

/**
 * Mounted only with a season, so a student who has none sends no request at all.
 * The dashboard is asked only for the org's today: without it the chips fall
 * back to the device's day, and overdue still comes from the server's flag.
 */
function SeasonWork({ seasonId }: { seasonId: number }) {
  const assignments = useStudentAssignments(seasonId);
  const quizzes = useStudentQuizList(seasonId);
  const dash = useStudentDashboard(seasonId);
  const [segment, setSegment] = useState<Segment>("todo");

  const refresh = () => {
    void assignments.refetch();
    void quizzes.refetch();
    void dash.refetch();
  };

  const { todo, doneAssignments, doneQuizzes, stats } = workSections(
    assignments.data ?? [],
    quizzes.data ?? [],
    dash.data?.todayOrgDay ?? deviceTodayKey(),
  );
  const doneCount = doneAssignments.length + doneQuizzes.length;

  let body: ReactNode;
  if (assignments.isPending) body = <RouteSkeleton />;
  else if (assignments.isError) body = <RouteError onRetry={() => void assignments.refetch()} />;
  else if (assignments.data.length === 0 && quizzes.data?.length === 0) {
    body = (
      <EmptyState
        icon={NAV_ICONS.assignments}
        title="No assignments or quizzes yet"
        description="Check back when your leader posts one."
      />
    );
  } else {
    const noRows = quizzes.isPending ? (
      <WorkLoadingRow />
    ) : quizzes.isError ? (
      // The quizzes may still hold work: only the assignments can be vouched for.
      <ListRow title={segment === "todo" ? "No open assignments." : "No assignments handed in yet."} />
    ) : (
      <ListRow title={segment === "todo" ? "You're all caught up." : "Nothing handed in yet."} />
    );
    body = (
      <View className="flex-col gap-4">
        <SegmentedControl
          options={[
            { value: "todo", label: `To do ${todo.length}` },
            { value: "done", label: `Done ${doneCount}` },
          ]}
          value={segment}
          onChange={(value) => setSegment(value as Segment)}
        />
        {segment === "todo" ? (
          <GroupedList>
            {todo.length > 0
              ? todo.map((row, i) => (
                  <WorkListRow key={row.key} row={row} index={i} subtitleLines={FULL_SUBTITLE_LINES} />
                ))
              : noRows}
          </GroupedList>
        ) : doneCount > 0 ? (
          <View className="flex-col gap-4">
            <DoneGroup header="Assignments" rows={doneAssignments} />
            <DoneGroup header="Quizzes" rows={doneQuizzes} />
          </View>
        ) : (
          <GroupedList>{noRows}</GroupedList>
        )}
        {quizzes.isError ? (
          <InlineError message="Couldn't load your quizzes." onRetry={() => void quizzes.refetch()} />
        ) : null}
        <View className="flex-row flex-wrap gap-3">
          <StatTile label="Submitted" value={stats.submitted} />
          <StatTile label="Pending" value={stats.pending} />
          <StatTile label="Reviewed" value={stats.reviewed} />
          <StatTile
            label="Quiz average"
            value={stats.quizAverage === null ? NO_VALUE : `${stats.quizAverage}%`}
          />
        </View>
      </View>
    );
  }

  return (
    <Screen
      {...TITLE}
      onRefresh={refresh}
      refreshing={assignments.isRefetching || quizzes.isRefetching || dash.isRefetching}
    >
      {body}
    </Screen>
  );
}

/**
 * The student's Work tab: assignments and quizzes in one list (P2-1). Also what
 * a student sees at /assignments and /quizzes, in place on the stack (P2-11).
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
