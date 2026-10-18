import { useRouter } from "expo-router";
import { Calendar as CalendarIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { UPCOMING_EVENTS_LIMIT, type SessionListItem } from "@space/shared";

import { UpcomingEventsCard } from "../../src/components/dashboard/UpcomingEventsCard";
import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { buildSeasonColors, SeasonCalendar } from "../../src/design/sessions/season-calendar";
import { Button as ButtonV1, EmptyState as EmptyStateV1 } from "../../src/design/ui";
import { useEvents, useUpcomingEvents } from "../../src/hooks/use-events";
import { useMyGroups } from "../../src/hooks/use-groups";
import { useCurrentSeasonId, useSeasons } from "../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useLedSeasonSessions, useSeasonSessions } from "../../src/hooks/use-sessions";
import { deviceTodayKey } from "../../src/lib/calendar-grid";
import { useSessionStore } from "../../src/store/session";

/** v1's anchor: the month of the next session, else the last one, else today. */
function initialAnchor(sessions: SessionListItem[], today: string): string {
  const next = sessions.find((s) => s.dayKey >= today);
  return next?.dayKey ?? sessions[sessions.length - 1]?.dayKey ?? today;
}

/**
 * ALUMNI — v1 app/alumni/calendar/page.tsx: "Events" / "Upcoming JPC community
 * events" and the upcoming-events card. Alumni have no season, so there are no
 * sessions to draw; v1's card (today onwards, capped by the server) is the page.
 */
function AlumniCalendar() {
  const events = useUpcomingEvents(UPCOMING_EVENTS_LIMIT);
  return (
    <ShellFrame onRefresh={() => void events.refetch()} refreshing={events.isRefetching}>
      <View className="flex-col gap-3">
        <PageTitle title="Events" subtitle="Upcoming JPC community events" />
        <UpcomingEventsCard query={events} />
      </View>
    </ShellFrame>
  );
}

/**
 * STUDENT — v1's SeasonCalendar for the pinned season (no window: one
 * season). A student with no season gets v1's empty state and nothing is
 * read (B2-13). Events come from a second query, interleaved on the client
 * exactly as v1's calendar does (D-15.1); its failure never fails the screen.
 */
function StudentCalendar() {
  const router = useRouter();
  const current = useCurrentSeasonId();

  if (current.seasonId === null && !current.isPending) {
    return (
      <ShellFrame>
        <View className="flex-col gap-3">
          <PageTitle title="Calendar" />
          <EmptyStateV1
            icon={CalendarIcon}
            title="No active season"
            description="An admin will enroll you in a season when you're ready."
          />
        </View>
      </ShellFrame>
    );
  }
  return (
    <StudentSeasonCalendar
      seasonId={current.seasonId}
      onRetrySeason={current.refetch}
      router={router}
    />
  );
}

function StudentSeasonCalendar({
  seasonId,
  onRetrySeason,
  router,
}: {
  seasonId: number | null;
  onRetrySeason: () => void;
  router: ReturnType<typeof useRouter>;
}) {
  const sessions = useSeasonSessions(seasonId);
  const events = useEvents();
  const eventRows = events.data ?? [];
  const today = deviceTodayKey();

  let body: ReactNode;
  if (seasonId === null || sessions.isPending) body = <RouteSkeleton />;
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0 && eventRows.length === 0)
    body = (
      <EmptyStateV1
        icon={CalendarIcon}
        title="Nothing scheduled yet"
        description="Sessions and events will appear here once they're added."
      />
    );
  else
    body = (
      <SeasonCalendar
        sessions={sessions.data}
        events={eventRows}
        today={today}
        // v1: current = startOfMonth(next session, else last, else today) — Week opens on that day's week.
        initialAnchor={`${initialAnchor(sessions.data, today).slice(0, 8)}01`}
        onOpenSession={(id) =>
          router.push({ pathname: "/session/[id]", params: { id: String(id) } })
        }
        onOpenEvent={(e) => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
      />
    );

  return (
    <ShellFrame
      onRefresh={() => {
        void events.refetch();
        if (seasonId !== null) void sessions.refetch();
        else onRetrySeason();
      }}
      refreshing={sessions.isRefetching}
    >
      <View className="flex-col gap-3">
        <PageTitle title="Calendar" />
        {body}
      </View>
    </ShellFrame>
  );
}

/**
 * LEADER — v1 app/leader/calendar/page.tsx: every session of every led
 * season in v1's SeasonCalendar, "{n} sessions" under the title. B3-6: each
 * led season is read on its own (GET /sessions is still windowed).
 */
function LeaderCalendar() {
  const router = useRouter();
  const groups = useMyGroups(true);
  const seasonIds = [...new Set((groups.data ?? []).map((g) => g.seasonId))];
  const led = useLedSeasonSessions(seasonIds);
  const events = useEvents();
  const eventRows = events.data ?? [];
  const today = deviceTodayKey();
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
  else if (n === 0 && eventRows.length === 0)
    body = (
      <EmptyStateV1
        icon={CalendarIcon}
        title="Nothing scheduled yet"
        description="Sessions and events will appear here once they're added."
      />
    );
  else
    body = (
      <SeasonCalendar
        sessions={led.sessions}
        events={eventRows}
        today={today}
        initialAnchor={`${initialAnchor(led.sessions, today).slice(0, 8)}01`}
        onOpenSession={(id) =>
          router.push({ pathname: "/session/[id]", params: { id: String(id) } })
        }
        onOpenEvent={(e) => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
      />
    );

  return (
    <ShellFrame
      onRefresh={() => {
        void groups.refetch();
        led.refetch();
        void events.refetch();
      }}
      refreshing={groups.isRefetching || led.isRefetching}
    >
      <View className="flex-col gap-4">
        <PageTitle
          title="Calendar"
          subtitle={
            groups.isPending || led.isPending
              ? undefined
              : `${n} ${n === 1 ? "session" : "sessions"}`
          }
        />
        {body}
      </View>
    </ShellFrame>
  );
}

/**
 * SUPER — v1 app/super/calendar/page.tsx (B5-4): "Calendar" / "All active
 * seasons across JPC." and v1's SeasonCalendar over every session of every
 * ACTIVE season, each season in its own palette colour with a legend. Like
 * the leader's (B3-6) it reads each season's own session list: GET /sessions
 * is still windowed, so it cannot give v1's whole-season grid.
 */
function SuperCalendar() {
  const router = useRouter();
  const seasons = useSeasons(true);
  const activeIds = (seasons.data ?? []).filter((s) => s.status === "ACTIVE").map((s) => s.id);
  const all = useLedSeasonSessions(activeIds);
  const events = useEvents();
  const eventRows = events.data ?? [];
  const today = deviceTodayKey();

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
  else if (all.sessions.length === 0 && eventRows.length === 0)
    body = (
      <EmptyStateV1
        icon={CalendarIcon}
        title="Nothing scheduled yet"
        description="Sessions and events will appear here once they're added."
      />
    );
  else
    body = (
      <SeasonCalendar
        sessions={all.sessions}
        events={eventRows}
        today={today}
        initialAnchor={`${initialAnchor(all.sessions, today).slice(0, 8)}01`}
        seasonColors={buildSeasonColors(all.sessions)}
        onOpenSession={(id) =>
          router.push({ pathname: "/session/[id]", params: { id: String(id) } })
        }
        onOpenEvent={(e) => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
      />
    );

  return (
    <ShellFrame
      onRefresh={() => {
        void seasons.refetch();
        all.refetch();
        void events.refetch();
      }}
      refreshing={seasons.isRefetching || all.isRefetching}
    >
      <View className="flex-col gap-4">
        <PageTitle title="Calendar" subtitle="All active seasons across JPC." />
        {body}
      </View>
    </ShellFrame>
  );
}

/**
 * ADMIN — v1 app/admin/season/[code]/calendar/page.tsx: "Calendar" with
 * "{n} sessions", an "Add session" button and v1's SeasonCalendar over every
 * session of the season. V2-ONLY kept: the season switcher (spec 03 §9; v1
 * forced one season via redirect, R86). Like the leader's (B3-6) it reads the
 * season's own session list rather than the windowed GET /sessions.
 */
function AdminCalendar() {
  const router = useRouter();
  const selection = useStaffSeasonSelection(true);
  const sessions = useSeasonSessions(selection.seasonId);
  const events = useEvents();
  const eventRows = events.data ?? [];
  const today = deviceTodayKey();
  const rows = sessions.data ?? [];
  const n = rows.length;

  let body: ReactNode;
  if (selection.isPending || (selection.seasonId !== null && sessions.isPending))
    body = <RouteSkeleton />;
  else if (selection.isError) body = <RouteError onRetry={selection.refetch} />;
  else if (selection.seasonId === null)
    body = (
      <EmptyStateV1
        icon={CalendarIcon}
        title="No season to show"
        description="You aren't assigned to a season yet."
      />
    );
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else
    body = (
      <SeasonCalendar
        // key: switching season starts again from that season's anchor month.
        key={selection.seasonId}
        sessions={rows}
        events={eventRows}
        today={today}
        initialAnchor={`${initialAnchor(rows, today).slice(0, 8)}01`}
        onOpenSession={(id) =>
          router.push({ pathname: "/session/[id]", params: { id: String(id) } })
        }
        onOpenEvent={(e) => router.push({ pathname: "/event/[id]", params: { id: String(e.id) } })}
      />
    );

  return (
    <ShellFrame
      onRefresh={() => {
        selection.refetch();
        void sessions.refetch();
        void events.refetch();
      }}
      refreshing={sessions.isRefetching}
    >
      <View className="flex-col gap-4">
        <View className="flex-row items-start justify-between gap-4">
          <PageTitle
            className="min-w-0 flex-1"
            title="Calendar"
            subtitle={
              sessions.isPending || selection.seasonId === null
                ? undefined
                : `${n} ${n === 1 ? "session" : "sessions"}`
            }
          />
          {selection.seasonId !== null ? (
            <ButtonV1
              onPress={() =>
                router.push({
                  pathname: "/session/new",
                  params: { seasonId: String(selection.seasonId) },
                })
              }
            >
              Add session
            </ButtonV1>
          ) : null}
        </View>
        <SeasonSwitcher
          seasons={selection.seasons}
          selectedId={selection.seasonId}
          onSelect={selection.setSeasonId}
        />
        {body}
      </View>
    </ShellFrame>
  );
}

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets a season switcher; SUPER and LEADER see
 * every season the server scopes them to, in an org-day window. MENTOR has
 * no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isAlumnus = useSessionStore((s) => (s.scopes?.graduationYear ?? null) !== null);
  const leadsNothing = useSessionStore(
    (s) => s.user?.role === "LEADER" && (s.scopes?.groupLeaderIds.length ?? 0) === 0,
  );

  if (role === "MENTOR") {
    return (
      <ShellFrame>
        <EmptyStateV1
          icon={CalendarIcon}
          title="Calendar"
          description="The calendar isn't available for your role."
        />
      </ShellFrame>
    );
  }
  if (leadsNothing) {
    return (
      <ShellFrame>
        <View className="flex-col gap-4">
          <PageTitle title="Calendar" subtitle="You don't lead any groups yet." />
          <EmptyStateV1
            icon={CalendarIcon}
            title="No calendar"
            description="An admin will add you to a group when you're ready."
          />
        </View>
      </ShellFrame>
    );
  }
  if (role === "LEADER") return <LeaderCalendar />;
  if (role === "SUPER") return <SuperCalendar />;
  if (role === "ADMIN") return <AdminCalendar />;
  if (isAlumnus) return <AlumniCalendar />;
  return <StudentCalendar />;
}
