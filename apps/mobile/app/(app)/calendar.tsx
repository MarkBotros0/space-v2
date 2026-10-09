import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { CalendarGrid } from "../../src/components/calendar/CalendarGrid";
import { DayEntries, Legend, type CalendarContext } from "../../src/components/calendar/CalendarEntries";
import { ChoiceChips } from "../../src/components/ChoiceChips";
import { useEvents } from "../../src/hooks/use-events";
import { useCurrentSeasonId } from "../../src/hooks/use-seasons";
import { useStaffSeasonSelection } from "../../src/hooks/use-season-selection";
import { useSeasonSessions, useSessionRange } from "../../src/hooks/use-sessions";
import {
  dayCue,
  deviceTodayKey,
  fetchWindow,
  rangeLabel,
  seasonSlots,
  stepAnchor,
  visibleKeys,
  type CalendarView,
} from "../../src/lib/calendar-grid";
import { groupCalendarByDay } from "../../src/lib/day-groups";
import { formatDayKey } from "../../src/lib/format";
import { parsePositiveInt } from "../../src/lib/params";
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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text variant="heading">{formatDayKey(group.dayKey)}</Text>
              {cue ? (
                <Text variant="caption" color={group.dayKey === ctx.today ? theme.colors.success[800] : theme.colors.brand.teal[800]}>
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

type Source =
  | { kind: "local"; sessions: SessionListItem[]; events: JpcEventListItem[] }
  | { kind: "range"; seasonId: number | null };

/** v1's anchor: the month of the next session, else the last one, else today. */
function initialAnchor(sessions: SessionListItem[], today: string): string {
  const next = sessions.find((s) => s.dayKey >= today);
  return next?.dayKey ?? sessions[sessions.length - 1]?.dayKey ?? today;
}

/**
 * The Upcoming / Week / Month toggle with its stepper (REG-75) around either
 * a pinned season's sessions already in hand, or windowed GET /sessions reads.
 * "Today" is the server's org day once a range read has reported it (its
 * `todayDayKey`); until then the device's date stands in.
 */
function CalendarSurface({ source, showSeason }: { source: Source; showSeason: boolean }) {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const isStaff = role !== null && role !== "STUDENT";
  const [orgToday, setOrgToday] = useState<string | null>(null);
  const today = orgToday ?? deviceTodayKey();
  const [view, setView] = useState<CalendarView>("upcoming");
  const [anchor, setAnchor] = useState(() =>
    source.kind === "local" ? initialAnchor(source.sessions, today) : today,
  );
  const slotsRef = useRef<Record<string, number>>({});

  const contextFor = (sessions: SessionListItem[]): CalendarContext => {
    if (showSeason) slotsRef.current = seasonSlots(sessions, slotsRef.current);
    return { today, isStaff, slots: showSeason ? slotsRef.current : null };
  };

  const step = (dir: 1 | -1) => {
    if (view !== "upcoming") setAnchor((a) => stepAnchor(view, a, dir));
  };

  let body: ReactNode;
  if (source.kind === "local") {
    const ctx = contextFor(source.sessions);
    if (view === "upcoming") {
      const sessions = source.sessions.filter((s) => s.dayKey >= today);
      const events = source.events.filter((e) => e.dayKey >= today);
      body =
        sessions.length === 0 && events.length === 0 ? (
          <EmptyState title="Nothing coming up" message="You're all caught up. Switch to Month to review past sessions." />
        ) : (
          <CalendarDays sessions={sessions} events={events} ctx={ctx} />
        );
    } else {
      body = (
        <>
          <Legend slots={ctx.slots} />
          <CalendarGrid view={view} anchor={anchor} sessions={source.sessions} events={source.events} ctx={ctx} />
        </>
      );
    }
  } else if (view === "upcoming") {
    body = <RangeSessions seasonId={source.seasonId} contextFor={contextFor} onOrgToday={setOrgToday} />;
  } else {
    body = <RangeGrid seasonId={source.seasonId} view={view} anchor={anchor} contextFor={contextFor} />;
  }

  return (
    <>
      <ChoiceChips label="Calendar view" options={VIEW_OPTIONS} value={view} onChange={setView} />
      {view !== "upcoming" ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 }}>
          <Button title="‹" variant="ghost" accessibilityLabel={`Previous ${view}`} onPress={() => step(-1)} />
          <Text variant="heading">{rangeLabel(view, anchor)}</Text>
          <Button title="›" variant="ghost" accessibilityLabel={`Next ${view}`} onPress={() => step(1)} />
        </View>
      ) : null}
      {body}
    </>
  );
}

/** STUDENT / ALUMNI — Plan 4's pinned-season calendar (no window: one season). */
function PinnedSeasonCalendar() {
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
  else if (current.isError) body = <ErrorState message="Couldn't load your seasons." onRetry={current.refetch} />;
  else if (current.seasonId === null)
    body =
      eventRows.length === 0 ? (
        <EmptyState title="No season to show" message="You aren't in a season right now, so there are no sessions on your calendar." />
      ) : (
        <CalendarSurface source={{ kind: "local", sessions: [], events: eventRows }} showSeason={false} />
      );
  else if (sessions.isPending) body = <LoadingState />;
  else if (sessions.isError)
    body = <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0 && eventRows.length === 0)
    body = <EmptyState title="No sessions" message="This season doesn't have any sessions yet." />;
  else body = <CalendarSurface source={{ kind: "local", sessions: sessions.data, events: eventRows }} showSeason={false} />;

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

type ContextFor = (sessions: SessionListItem[]) => CalendarContext;

/**
 * The Upcoming (agenda) view: everything from the start of the org's today
 * onward, unbounded, with no paging — past sessions only through Week/Month.
 * v1 parity 2026-10-09 (03-sessions R98, R75; v1 season-calendar.tsx:236-251):
 * was an 8-week window with Earlier/Later. GET /sessions with no bounds returns
 * every session of the scoped seasons; `todayDayKey` is the server's org day (C2).
 */
function RangeSessions({
  seasonId,
  contextFor,
  onOrgToday,
}: {
  seasonId: number | null;
  contextFor: ContextFor;
  onOrgToday: (dayKey: string) => void;
}) {
  const range = useSessionRange({ seasonId, from: null, to: null }, true);
  const events = useEvents();
  const reportedToday = range.data?.todayDayKey;

  useEffect(() => {
    if (reportedToday) onOrgToday(reportedToday);
  }, [reportedToday, onOrgToday]);

  if (range.isPending) return <LoadingState />;
  if (range.isError) {
    return <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void range.refetch()} />;
  }
  const today = range.data.todayDayKey;
  const sessions = range.data.sessions.filter((s) => s.dayKey >= today);
  const eventRows = (events.data ?? []).filter((e) => e.dayKey >= today);
  return sessions.length === 0 && eventRows.length === 0 ? (
    <EmptyState title="Nothing coming up" message="You're all caught up. Switch to Month to review past sessions." />
  ) : (
    <CalendarDays sessions={sessions} events={eventRows} ctx={contextFor(range.data.sessions)} />
  );
}

/** Week / Month: reads the visible days (padded a day each side, the server files each by its dayKey). */
function RangeGrid({
  seasonId,
  view,
  anchor,
  contextFor,
}: {
  seasonId: number | null;
  view: Exclude<CalendarView, "upcoming">;
  anchor: string;
  contextFor: ContextFor;
}) {
  const keys = visibleKeys(view, anchor);
  const { from, to } = fetchWindow(keys);
  const range = useSessionRange({ seasonId, from, to }, true);
  const events = useEvents();

  if (range.isPending) return <LoadingState />;
  if (range.isError) {
    return <ErrorState message="Couldn't load sessions. Check your connection and try again." onRetry={() => void range.refetch()} />;
  }
  const first = keys[0] ?? anchor;
  const last = keys[keys.length - 1] ?? anchor;
  const inView = (k: string) => k >= first && k <= last;
  const sessions = range.data.sessions.filter((s) => inView(s.dayKey));
  const eventRows = (events.data ?? []).filter((e) => inView(e.dayKey));
  const ctx = contextFor(sessions);
  return (
    <>
      <Legend slots={ctx.slots} />
      <CalendarGrid view={view} anchor={anchor} sessions={sessions} events={eventRows} ctx={ctx} />
    </>
  );
}

/** SUPER (every ACTIVE season) and LEADER (every led season) — G17. */
function MultiSeasonCalendar() {
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <CalendarSurface source={{ kind: "range", seasonId: null }} showSeason />
    </Screen>
  );
}

/**
 * One season's full calendar, opened by `seasonId` (e.g. after creating a
 * session — v1 session-form.tsx:125 goes to the season's calendar, 03 R30).
 * The server refuses a season outside the caller's scope.
 */
function SeasonCalendar({ seasonId }: { seasonId: number }) {
  return (
    <Screen edges={["top", "left", "right"]} scroll>
      <CalendarSurface key={seasonId} source={{ kind: "range", seasonId }} showSeason={false} />
    </Screen>
  );
}

/**
 * ADMIN — v1's /admin/calendar redirect (03-sessions R86, v1
 * admin/calendar/page.tsx:16-40): the newest ACTIVE administered season, else
 * the newest of any status, with no picker. Other seasons' calendars are
 * reached from their season workspace. v1 parity 2026-10-09: was a SeasonSwitcher.
 */
function AdminCalendar() {
  const selection = useStaffSeasonSelection(true);
  if (selection.isPending || selection.isError || selection.seasonId === null) {
    return (
      <Screen edges={["top", "left", "right"]} scroll>
        {selection.isPending ? (
          <LoadingState />
        ) : selection.isError ? (
          <ErrorState message="Couldn't load your seasons." onRetry={selection.refetch} />
        ) : (
          <EmptyState title="No season to show" message="No active season found." />
        )}
      </Screen>
    );
  }
  return <SeasonCalendar seasonId={selection.seasonId} />;
}

/**
 * /calendar — one route, every role (Decision D1). STUDENT/ALUMNI keep
 * Plan 4's pinned season; ADMIN gets v1's one-season redirect target; SUPER
 * and LEADER see every season the server scopes them to. A `seasonId` param
 * opens that one season for staff. MENTOR has no calendar in its nav (spec 03 §9).
 */
export default function CalendarScreen() {
  const role = useSessionStore((s) => s.user?.role ?? null);
  const { seasonId: rawSeasonId } = useLocalSearchParams<{ seasonId?: string }>();
  const paramSeasonId = parsePositiveInt(rawSeasonId);
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
      <Screen edges={["top", "left", "right"]}>
        <EmptyState title="No calendar" message="You don't lead any groups yet." />
      </Screen>
    );
  }
  if (paramSeasonId !== null && (role === "SUPER" || role === "LEADER" || role === "ADMIN")) {
    return <SeasonCalendar seasonId={paramSeasonId} />;
  }
  if (role === "SUPER" || role === "LEADER") return <MultiSeasonCalendar />;
  if (role === "ADMIN") return <AdminCalendar />;
  return <PinnedSeasonCalendar />;
}
