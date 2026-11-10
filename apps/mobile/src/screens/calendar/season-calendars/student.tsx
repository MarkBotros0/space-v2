import { Calendar as CalendarIcon } from "lucide-react-native";
import type { ReactNode } from "react";

import { RouteError, RouteSkeleton } from "../../../design/layout/route-states";
import { Screen } from "../../../design/layout/screen";
import { EmptyState } from "../../../design/ui";
import { useStudentDashboard } from "../../../hooks/use-dashboard";
import { useEvents } from "../../../hooks/use-events";
import { useCurrentSeasonId } from "../../../hooks/use-seasons";
import { useSeasonSessions } from "../../../hooks/use-sessions";

import { NothingScheduled, RoutedSeasonCalendar } from "./shared";

/**
 * STUDENT — v1's SeasonCalendar for the pinned season (no window: one
 * season). A student with no season gets v1's empty state and nothing is
 * read (B2-13). Events come from a second query, interleaved on the client
 * exactly as v1's calendar does (D-15.1); its failure never fails the screen.
 */
export function StudentCalendar() {
  const current = useCurrentSeasonId();

  if (current.seasonId === null && !current.isPending) {
    return (
      <Screen title="Calendar">
        <EmptyState
          icon={CalendarIcon}
          title="No active season"
          description="An admin will enroll you in a season when you're ready."
        />
      </Screen>
    );
  }
  return <StudentSeasonCalendar seasonId={current.seasonId} onRetrySeason={current.refetch} />;
}

function StudentSeasonCalendar({ seasonId, onRetrySeason }: { seasonId: number | null; onRetrySeason: () => void }) {
  const sessions = useSeasonSessions(seasonId);
  const events = useEvents();
  // The server's today, so this tab agrees with Today in any timezone: the Upcoming
  // filter, the highlight, the anchor and each row's cue. Waited for because the
  // anchor is only read once; if it fails, the device's day stands in.
  const dash = useStudentDashboard(seasonId);
  const eventRows = events.data ?? [];

  let body: ReactNode;
  if (seasonId === null || sessions.isPending || dash.isPending) body = <RouteSkeleton />;
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0 && eventRows.length === 0) body = <NothingScheduled />;
  else body = <RoutedSeasonCalendar sessions={sessions.data} events={eventRows} today={dash.data?.todayOrgDay} />;

  return (
    <Screen
      title="Calendar"
      onRefresh={() => {
        void events.refetch();
        void dash.refetch();
        if (seasonId !== null) void sessions.refetch();
        else onRetrySeason();
      }}
      refreshing={sessions.isRefetching}
    >
      {body}
    </Screen>
  );
}
