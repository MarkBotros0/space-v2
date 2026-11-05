import { useRouter } from "expo-router";
import { Calendar as CalendarIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { SeasonSwitcher } from "../../components/SeasonSwitcher";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import {
  buildSeasonColors,
  SeasonCalendar,
  type SeasonColors,
} from "../../design/sessions/season-calendar";
import { Button, EmptyState } from "../../design/ui";
import { useStudentDashboard } from "../../hooks/use-dashboard";
import { useEvents } from "../../hooks/use-events";
import { useMyGroups } from "../../hooks/use-groups";
import { useCurrentSeasonId, useSeasons } from "../../hooks/use-seasons";
import { useStaffSeasonSelection } from "../../hooks/use-season-selection";
import { useLedSeasonSessions, useSeasonSessions } from "../../hooks/use-sessions";
import { deviceTodayKey, initialMonthAnchor } from "../../lib/calendar-grid";

function sessionCount(n: number): string {
  return `${n} ${n === 1 ? "session" : "sessions"}`;
}

function NothingScheduled() {
  return (
    <EmptyState
      icon={CalendarIcon}
      title="Nothing scheduled yet"
      description="Sessions and events will appear here once they're added."
    />
  );
}

/**
 * v1's SeasonCalendar opened on its anchor month (v1: startOfMonth(next
 * session, else last, else today) — Week opens on that day's week), with a
 * tap on a session or an event opening its detail page.
 */
function RoutedSeasonCalendar({
  sessions,
  events,
  seasonColors,
  today: serverToday,
}: {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  seasonColors?: SeasonColors;
  /** The org's today, from the server. Without it, the device's. */
  today?: string;
}) {
  const router = useRouter();
  const today = serverToday ?? deviceTodayKey();
  return (
    <SeasonCalendar
      sessions={sessions}
      events={events}
      today={today}
      initialAnchor={initialMonthAnchor(sessions, today)}
      seasonColors={seasonColors}
      onOpenSession={(id) => router.push({ pathname: "/session/[id]", params: { id: String(id) } })}
      onOpenEvent={(e) => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
    />
  );
}

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

function StudentSeasonCalendar({
  seasonId,
  onRetrySeason,
}: {
  seasonId: number | null;
  onRetrySeason: () => void;
}) {
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
  else
    body = (
      <RoutedSeasonCalendar
        sessions={sessions.data}
        events={eventRows}
        today={dash.data?.todayOrgDay}
      />
    );

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
  const eventRows = events.data ?? [];
  const n = led.sessions.length;

  let body: ReactNode;
  if (groups.isPending || led.isPending) body = <RouteSkeleton />;
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
  else body = <RoutedSeasonCalendar sessions={led.sessions} events={eventRows} />;

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
  const eventRows = events.data ?? [];

  let body: ReactNode;
  if (seasons.isPending || (activeIds.length > 0 && all.isPending)) body = <RouteSkeleton />;
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

/**
 * ADMIN — v1 app/admin/season/[code]/calendar/page.tsx: "Calendar" with
 * "{n} sessions", an "Add session" button and v1's SeasonCalendar over every
 * session of the season. V2-ONLY kept: the season switcher (spec 03 §9; v1
 * forced one season via redirect, R86). Like the leader's (B3-6) it reads the
 * season's own session list rather than the windowed GET /sessions.
 */
export function AdminCalendar() {
  const router = useRouter();
  const selection = useStaffSeasonSelection(true);
  const sessions = useSeasonSessions(selection.seasonId);
  const events = useEvents();
  const eventRows = events.data ?? [];
  const rows = sessions.data ?? [];

  let body: ReactNode;
  if (selection.isPending || (selection.seasonId !== null && sessions.isPending))
    body = <RouteSkeleton />;
  else if (selection.isError) body = <RouteError onRetry={selection.refetch} />;
  else if (selection.seasonId === null)
    body = (
      <EmptyState
        icon={CalendarIcon}
        title="No season to show"
        description="You aren't assigned to a season yet."
      />
    );
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else
    body = (
      // key: switching season starts again from that season's anchor month.
      <RoutedSeasonCalendar key={selection.seasonId} sessions={rows} events={eventRows} />
    );

  return (
    <Screen
      title="Calendar"
      onRefresh={() => {
        selection.refetch();
        void sessions.refetch();
        void events.refetch();
      }}
      refreshing={sessions.isRefetching}
      subtitle={
        sessions.isPending || selection.seasonId === null ? undefined : sessionCount(rows.length)
      }
      trailing={
        selection.seasonId !== null ? (
          <Button
            onPress={() =>
              router.push({
                pathname: "/session/new",
                params: { seasonId: String(selection.seasonId) },
              })
            }
          >
            Add session
          </Button>
        ) : undefined
      }
    >
      <View className="flex-col gap-4">
        <SeasonSwitcher
          seasons={selection.seasons}
          selectedId={selection.seasonId}
          onSelect={selection.setSeasonId}
        />
        {body}
      </View>
    </Screen>
  );
}
