import type { ReactNode } from "react";

import { RouteError, RouteSkeleton } from "../../../design/layout/route-states";
import { Screen } from "../../../design/layout/screen";
import { useStaffOrgToday } from "../../../hooks/use-dashboard";
import { useEvents } from "../../../hooks/use-events";
import { useMyGroups } from "../../../hooks/use-groups";
import { useLedSeasonSessions } from "../../../hooks/use-sessions";

import { NothingScheduled, RoutedSeasonCalendar, sessionCount } from "./shared";

/**
 * LEADER — v1 app/leader/calendar/page.tsx: every session of every led
 * season in v1's SeasonCalendar, "{n} sessions" under the title. B3-6: each
 * led season is read on its own (GET /sessions is still windowed).
 */
export function LeaderCalendar() {
  const groups = useMyGroups(true);
  const seasonIds = [...new Set((groups.data ?? []).map((g) => g.seasonId))];
  const led = useLedSeasonSessions(seasonIds);
  const events = useEvents();
  // The org's day for the highlight, Upcoming and the anchor (any led season gives the same
  // one); waited for because the anchor is read once. A failure falls back to the device's.
  const orgToday = useStaffOrgToday(seasonIds[0] ?? null);
  const eventRows = events.data ?? [];
  const n = led.sessions.length;

  let body: ReactNode;
  if (groups.isPending || led.isPending || orgToday.isPending) body = <RouteSkeleton />;
  else if (groups.isError || led.isError)
    body = (
      <RouteError
        onRetry={() => {
          void groups.refetch();
          led.refetch();
        }}
      />
    );
  else if (n === 0 && eventRows.length === 0) body = <NothingScheduled />;
  else body = <RoutedSeasonCalendar sessions={led.sessions} events={eventRows} today={orgToday.today} />;

  return (
    <Screen
      title="Calendar"
      onRefresh={() => {
        void groups.refetch();
        led.refetch();
        void events.refetch();
      }}
      refreshing={groups.isRefetching || led.isRefetching}
      subtitle={groups.isPending || led.isPending ? undefined : sessionCount(n)}
    >
      {body}
    </Screen>
  );
}
