import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { CalendarGrid } from "../../components/calendar/CalendarGrid";
import { Legend, type CalendarContext } from "../../components/calendar/CalendarEntries";
import { useEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { useSeasonSessions } from "../../hooks/use-sessions";
import {
  deviceTodayKey,
  initialAnchor,
  rangeLabel,
  stepAnchor,
  type CalendarView,
} from "../../lib/calendar-grid";
import { groupCalendarByDay } from "../../lib/day-groups";
import { iconWithClassName } from "../../design/lib/icon";
import { RouteError, RouteSkeleton } from "../../design/layout/route-states";
import { Screen } from "../../design/layout/screen";
import { Button } from "../../design/ui/button";
import { EmptyState } from "../../design/ui/empty-state";
import { SegmentedControl } from "../../design/ui/segmented-control";
import { Text } from "../../design/ui/text";
import { EventDayList, EventDayRows } from "../alumni/event-day-list";

iconWithClassName(ChevronLeft);
iconWithClassName(ChevronRight);

const VIEW_OPTIONS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

interface Source {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
}

/**
 * The Upcoming / Week / Month toggle with its stepper (REG-75) around a
 * pinned season's sessions already in hand. "Today" is the device's date;
 * every day, time and order comes from the server's org-clock values (X13).
 */
function CalendarSurface({ source }: { source: Source }) {
  const today = deviceTodayKey();
  const [view, setView] = useState<CalendarView>("upcoming");
  const [anchor, setAnchor] = useState(() => initialAnchor(source.sessions, today));

  const ctx: CalendarContext = { today, isStaff: false, slots: null };

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
          icon={CalendarIcon}
          title="Nothing coming up"
          description="You're all caught up. Switch to Month to review past sessions."
        />
      ) : (
        <EventDayList groups={groupCalendarByDay(sessions, events)} today={today} />
      );
  } else {
    body = (
      <>
        <CalendarGrid
          view={view}
          anchor={anchor}
          sessions={source.sessions}
          events={source.events}
          ctx={ctx}
          renderEntries={(entries) => <EventDayRows entries={entries} today={today} />}
        />
        {view === "month" ? (
          <View className="mt-6">
            <Legend slots={ctx.slots} />
          </View>
        ) : null}
      </>
    );
  }

  return (
    <>
      <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={(v) => setView(v as CalendarView)} />
      {view !== "upcoming" ? (
        <View className="mt-3 flex-row items-center justify-between">
          <Button variant="plain" size="icon" accessibilityLabel={`Previous ${view}`} onPress={() => step(-1)}>
            <ChevronLeft size={16} className="text-foreground" />
          </Button>
          <Text variant="headline">{rangeLabel(view, anchor)}</Text>
          <Button variant="plain" size="icon" accessibilityLabel={`Next ${view}`} onPress={() => step(1)}>
            <ChevronRight size={16} className="text-foreground" />
          </Button>
        </View>
      ) : null}
      <View className="mt-4">{body}</View>
    </>
  );
}

/** ALUMNI — the pinned season's sessions and the org's events, on grouped rows. */
export function AlumniCalendar() {
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
  if (current.isPending) body = <RouteSkeleton />;
  else if (current.isError) body = <RouteError onRetry={current.refetch} />;
  else if (current.seasonId === null)
    // No season: events are all there is, so (unlike the with-season path) their
    // loading and failure are the screen's own states.
    body =
      eventRows.length === 0 && events.isPending ? (
        <RouteSkeleton />
      ) : eventRows.length === 0 && events.isError ? (
        <RouteError onRetry={() => void events.refetch()} />
      ) : eventRows.length === 0 ? (
        <EmptyState
          icon={CalendarIcon}
          title="No season to show"
          description="You aren't in a season right now, so there are no sessions on your calendar."
        />
      ) : (
        <CalendarSurface source={{ sessions: [], events: eventRows }} />
      );
  else if (sessions.isPending) body = <RouteSkeleton />;
  else if (sessions.isError) body = <RouteError onRetry={() => void sessions.refetch()} />;
  else if (sessions.data.length === 0 && eventRows.length === 0)
    body = (
      <EmptyState
        icon={CalendarIcon}
        title="No sessions"
        description="This season doesn't have any sessions yet."
      />
    );
  else body = <CalendarSurface source={{ sessions: sessions.data, events: eventRows }} />;

  return (
    <Screen
      title="Events"
      onRefresh={() => {
        void events.refetch();
        if (current.seasonId !== null) void sessions.refetch();
        else current.refetch();
      }}
      refreshing={sessions.isRefetching || events.isRefetching}
    >
      {body}
    </Screen>
  );
}
