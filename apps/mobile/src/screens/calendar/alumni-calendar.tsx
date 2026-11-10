import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { CalendarGrid } from "./calendar-grid";
import { Legend, type CalendarContext } from "./calendar-entries";
import { useEvents } from "../../hooks/use-events";
import { deviceTodayKey, initialAnchor, rangeLabel, stepAnchor, type CalendarView } from "../../lib/calendar-grid";
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
 * events (and sessions, when given) already in hand. "Today" is the device's date;
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

/**
 * ALUMNI — the org's events, on grouped rows. Only an alumnus who is not studying
 * reaches this (one studying has a season and gets the student calendar), so there
 * is never a season to pin: events are all there is, and their loading and failure
 * are the screen's own states.
 */
export function AlumniCalendar() {
  const events = useEvents();
  const eventRows = events.data ?? [];

  let body: ReactNode;
  if (eventRows.length === 0 && events.isPending) body = <RouteSkeleton />;
  else if (eventRows.length === 0 && events.isError) body = <RouteError onRetry={() => void events.refetch()} />;
  else if (eventRows.length === 0)
    body = (
      <EmptyState
        icon={CalendarIcon}
        title="No season to show"
        description="You aren't in a season right now, so there are no sessions on your calendar."
      />
    );
  else body = <CalendarSurface source={{ sessions: [], events: eventRows }} />;

  return (
    <Screen title="Events" onRefresh={() => void events.refetch()} refreshing={events.isRefetching}>
      {body}
    </Screen>
  );
}
