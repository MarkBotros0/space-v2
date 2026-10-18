import { useRouter } from "expo-router";
import { Calendar as CalendarIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { CalendarGrid } from "../../src/components/calendar/CalendarGrid";
import {
  DayEntries,
  Legend,
  type CalendarContext,
} from "../../src/components/calendar/CalendarEntries";
import { ChoiceChips } from "../../src/components/ChoiceChips";
import { SeasonSwitcher } from "../../src/components/SeasonSwitcher";
import { PageTitle } from "../../src/design/layout/page-title";
import { RouteError, RouteSkeleton } from "../../src/design/layout/route-states";
import { ShellFrame } from "../../src/design/layout/shell-frame";
import { buildSeasonColors, SeasonCalendar } from "../../src/design/sessions/season-calendar";
import { Button as ButtonV1, EmptyState as EmptyStateV1 } from "../../src/design/ui";
import { useEvents } from "../../src/hooks/use-events";
import { useMyGroups } from "../../src/hooks/use-groups";
import { useCurrentSeasonId, useSeasons } from "../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useLedSeasonSessions, useSeasonSessions } from "../../src/hooks/use-sessions";
import {
  dayCue,
  deviceTodayKey,
  rangeLabel,
  stepAnchor,
  type CalendarView,
} from "../../src/lib/calendar-grid";
import { groupCalendarByDay } from "../../src/lib/day-groups";
import { formatDayKey } from "../../src/lib/format";
import { useSessionStore } from "../../src/store/session";
import { useTheme } from "../../src/theme";
import { Button, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../src/ui";

/**
 * Day-grouped sessions and JPC events. Every day, time and order comes from the
 * server's org-clock values (X13) — never a device-zone formatter, which would
 * split an org-midnight event from its day's sessions on a phone west of Cairo.
 * Headings carry v1's "Today" / "in N days" cue (REG-76).
 */
function CalendarDays({
  sessions,
  events,
  ctx,
}: {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  ctx: CalendarContext;
}) {
  const theme = useTheme();
  return (
    <>
      <Legend slots={ctx.slots} />
      {groupCalendarByDay(sessions, events).map((group) => {
        const cue = dayCue(group.dayKey, ctx.today);
        return (
          <View key={group.dayKey} style={{ marginBottom: theme.spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <Text variant="heading">{formatDayKey(group.dayKey)}</Text>
              {cue ? (
                <Text
                  variant="caption"
                  color={
                    group.dayKey === ctx.today
                      ? theme.colors.success[800]
                      : theme.colors.brand.teal[800]
                  }
                >
                  {cue}
                </Text>
              ) : null}
            </View>
            <DayEntries entries={group.entries} ctx={ctx} />
          </View>
        );
      })}
    </>
  );
}

const VIEW_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

type Source = { kind: "local"; sessions: SessionListItem[]; events: JpcEventListItem[] };

/** v1's anchor: the month of the next session, else the last one, else today. */
function initialAnchor(sessions: SessionListItem[], today: string): string {
  const next = sessions.find((s) => s.dayKey >= today);
  return next?.dayKey ?? sessions[sessions.length - 1]?.dayKey ?? today;
}

/**
 * The Upcoming / Week / Month toggle with its stepper (REG-75) around either
 * a pinned season's sessions already in hand, or windowed GET /sessions reads.
 * "Today" is the server's org day once a default-window read has reported it
 * (its `fromDayKey`); until then the device's date stands in.
 */
function CalendarSurface({ source }: { source: Source }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role !== null && role !== "STUDENT";
  const today = deviceTodayKey();
  const [view, setView] = useState<CalendarView>("upcoming");
  const [anchor, setAnchor] = useState(() => initialAnchor(source.sessions, today));

  const ctx: CalendarContext = { today, isStaff, slots: null };

  const step = (dir: 1 | -1) => {
    if (view !== "upcoming") setAnchor((a) => stepAnchor(view, a, dir));
  };

  let body: ReactNode;
  if (view === "upcoming") {
    const sessions = source.sessions.filter((s) => s.dayKey >= today);
    const events = source.events.filter((e) => e.dayKey >= today);
    body =
      sessions.length === 0 && events.length === 0 ? (
        <EmptyState
          title="Nothing coming up"
          message="You're all caught up. Switch to Month to review past sessions."
        />
      ) : (
        <CalendarDays sessions={sessions} events={events} ctx={ctx} />
      );
  } else {
    body = (
      <>
        <Legend slots={ctx.slots} />
        <CalendarGrid
          view={view}
          anchor={anchor}
          sessions={source.sessions}
          events={source.events}
          ctx={ctx}
        />
      </>
    );
  }

  return (
    <>
      <ChoiceChips label="Calendar view" options={VIEW_OPTIONS} value={view} onChange={setView} />
      {view !== "upcoming" ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginVertical: 8,
          }}
        >
          <Button
            title="‹"
            variant="ghost"
            accessibilityLabel={`Previous ${view}`}
            onPress={() => step(-1)}
          />
          <Text variant="heading">{rangeLabel(view, anchor)}</Text>
          <Button
            title="›"
            variant="ghost"
            accessibilityLabel={`Next ${view}`}
            onPress={() => step(1)}
          />
        </View>
      ) : null}
      {body}
    </>
  );
}

/** ALUMNI — Plan 4's pinned-season calendar, pre-rebuild UI until batch 6 (v1 alumni get an Events page). */
function AlumniCalendar() {
  const current = useCurrentSeasonId();
  const sessions = useSeasonSessions(current.seasonId);
  // Two queries, interleaved on the client — exactly what v1's calendar pages
  // do (season-calendar.tsx merges a session list and an event list). A single
  // /api/v1/calendar endpoint is the tidier shape and is deliberately deferred
  // (D-15.1). The events query is NOT allowed to fail the screen: its error is
  // swallowed into an empty array, because a calendar with no JPC events is
  // still a calendar and a calendar with no sessions is not.
  const events = useEvents();
  const eventRows = events.data ?? [];

  let body: ReactNode;
  if (current.isPending) body = <LoadingState />;
  else if (current.isError)
    body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body =
      eventRows.length === 0 ? (
        <EmptyState
          title="No season to show"
          message="You aren't in a season right now, so there are no sessions on your calendar."
        />
      ) : (
        <CalendarSurface source={{ kind: "local", sessions: [], events: eventRows }} />
      );
  else if (sessions.isPending) body = <LoadingState />;
  else if (sessions.isError)
    body = (
      <ErrorState
        message="Couldn't load sessions. Check your connection and try again."
        onRetry={() => void sessions.refetch()}
      />
    );
  else if (sessions.data.length === 0 && eventRows.length === 0)
    body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  else
    body = (
      <CalendarSurface source={{ kind: "local", sessions: sessions.data, events: eventRows }} />
    );

  return (
    <Screen
      edges={["top", "left", "right"]}
      scroll
      onRefresh={() => {
        void events.refetch();
        if (current.seasonId !== null) void sessions.refetch();
        else current.refetch();
      }}
      refreshing={sessions.isRefetching}
    >
      {body}
    </Screen>
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
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="Calendar" message="The calendar isn't available for your role." />
      </Screen>
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
