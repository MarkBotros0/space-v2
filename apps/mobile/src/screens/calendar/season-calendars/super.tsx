import type { ReactNode } from "react";

import { RouteError, RouteSkeleton } from "../../../design/layout/route-states";
import { Screen } from "../../../design/layout/screen";
import { buildSeasonColors } from "../../../design/calendar/season-calendar";
import { useStaffOrgToday } from "../../../hooks/use-dashboard";
import { useEvents } from "../../../hooks/use-events";
import { useSeasons } from "../../../hooks/use-seasons";
import { useLedSeasonSessions } from "../../../hooks/use-sessions";

import { NothingScheduled, RoutedSeasonCalendar } from "./shared";

/**
 * SUPER — v1 app/super/calendar/page.tsx (B5-4): "Calendar" / "All active
 * seasons across JPC." and v1's SeasonCalendar over every session of every
 * ACTIVE season, each season in its own palette colour with a legend. Like
 * the leader's (B3-6) it reads each season's own session list: GET /sessions
 * is still windowed, so it cannot give v1's whole-season grid.
 */
export function SuperCalendar() {
  const seasons = useSeasons(true);
  const activeIds = (seasons.data ?? []).filter((s) => s.status === "ACTIVE").map((s) => s.id);
  const all = useLedSeasonSessions(activeIds);
  const events = useEvents();
  // The org's day, from the first active season's dashboard; see LeaderCalendar.
  const orgToday = useStaffOrgToday(activeIds[0] ?? null);
  const eventRows = events.data ?? [];

  let body: ReactNode;
  if (seasons.isPending || (activeIds.length > 0 && all.isPending) || orgToday.isPending) body = <RouteSkeleton />;
  else if (seasons.isError || all.isError)
    body = (
      <RouteError
        onRetry={() => {
          void seasons.refetch();
          all.refetch();
        }}
      />
    );
  else if (all.sessions.length === 0 && eventRows.length === 0) body = <NothingScheduled />;
  else
    body = (
      <RoutedSeasonCalendar
        sessions={all.sessions}
        events={eventRows}
        seasonColors={buildSeasonColors(all.sessions)}
        today={orgToday.today}
      />
    );

  return (
    <Screen
      title="Calendar"
      onRefresh={() => {
        void seasons.refetch();
        all.refetch();
        void events.refetch();
      }}
      refreshing={seasons.isRefetching || all.isRefetching}
      subtitle="All active seasons across JPC."
    >
      {body}
    </Screen>
  );
}
