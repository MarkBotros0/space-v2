import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { CalendarGrid } from "../../components/calendar/CalendarGrid";
import {
  DayEntries,
  Legend,
  type CalendarContext,
} from "../../components/calendar/CalendarEntries";
import { ChoiceChips } from "../../components/ChoiceChips";
import { useEvents } from "../../hooks/use-events";
import { useCurrentSeasonId } from "../../hooks/use-seasons";
import { useSeasonSessions } from "../../hooks/use-sessions";
import {
  dayCue,
  deviceTodayKey,
  initialAnchor,
  rangeLabel,
  stepAnchor,
  type CalendarView,
} from "../../lib/calendar-grid";
import { groupCalendarByDay } from "../../lib/day-groups";
import { formatDayKey } from "../../lib/format";
import { useSessionStore } from "../../store/session";
import { useTheme } from "../../theme";
import { Button, EmptyState, ErrorState, LoadingState, Screen, Text } from "../../ui";

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

interface Source {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
}

/**
 * The Upcoming / Week / Month toggle with its stepper (REG-75) around a
 * pinned season's sessions already in hand. "Today" is the device's date.
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
        <CalendarSurface source={{ sessions: [], events: eventRows }} />
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
  else body = <CalendarSurface source={{ sessions: sessions.data, events: eventRows }} />;

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
