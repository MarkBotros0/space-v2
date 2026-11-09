/**
 * Port of v1 src/components/sessions/season-calendar.tsx for a pinned season
 * (the student calendar): an Upcoming agenda with a time rail, and Week /
 * Month as one Monday-first 7-column grid of title chips.
 * Every day and time comes from the server's org-clock strings (X13).
 * Native differences: hover states → pressed; event rows without a url open
 * v2's event screen (v1 has no event page). `seasonColors` is SUPER's
 * multi-season mode (v1 SEASON_PALETTE): each session chip and agenda badge
 * is coloured by its season and a legend names them.
 */
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { rangeLabel, stepAnchor, type CalendarView } from "../../lib/calendar-grid";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Button } from "../ui/button";
import { SegmentedControl } from "../ui/segmented-control";
import { Text } from "../ui/text";
import { DaySheet } from "./day-sheet";
import { AgendaView } from "./season-calendar-agenda";
import { CalendarGrid } from "./season-calendar-grid";
import type { Handlers, SeasonColors } from "./season-colors";

export { buildSeasonColors, type SeasonColor, type SeasonColors } from "./season-colors";

iconWithClassName(ChevronLeft, ChevronRight);

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

function SeasonLegend({ colors }: { colors: SeasonColors }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {Object.entries(colors).map(([code, c]) => (
        <View key={code} className={cn("rounded px-2 py-0.5", c.box)}>
          <Text className={cn("text-xs", c.text)}>{code}</Text>
        </View>
      ))}
    </View>
  );
}

export function SeasonCalendar({
  sessions,
  events,
  today,
  initialAnchor,
  onOpenSession,
  onOpenEvent,
  seasonColors,
}: {
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  today: string;
  initialAnchor: string;
} & Handlers) {
  const [view, setView] = useState<CalendarView>("upcoming");
  const [anchor, setAnchor] = useState(initialAnchor);
  const [day, setDay] = useState<string | null>(null);
  const handlers = { onOpenSession, onOpenEvent, seasonColors };

  return (
    <View className="flex-col gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          className="self-start"
          options={VIEWS}
          value={view}
          onChange={(v) => setView(v as CalendarView)}
        />
        {view !== "upcoming" ? (
          <View className="flex-row items-center gap-1">
            <Button
              variant="plain"
              size="icon"
              accessibilityLabel={`Previous ${view}`}
              onPress={() => setAnchor((a) => stepAnchor(view, a, -1))}
            >
              <ChevronLeft size={16} className="text-foreground" />
            </Button>
            <Text className="min-w-32 text-center text-sm font-semibold text-foreground">
              {rangeLabel(view, anchor)}
            </Text>
            <Button
              variant="plain"
              size="icon"
              accessibilityLabel={`Next ${view}`}
              onPress={() => setAnchor((a) => stepAnchor(view, a, 1))}
            >
              <ChevronRight size={16} className="text-foreground" />
            </Button>
          </View>
        ) : null}
      </View>
      {seasonColors ? <SeasonLegend colors={seasonColors} /> : null}
      {view === "upcoming" ? (
        <AgendaView sessions={sessions} events={events} today={today} {...handlers} />
      ) : (
        <CalendarGrid
          view={view}
          anchor={anchor}
          sessions={sessions}
          events={events}
          today={today}
          onOpenDay={setDay}
          {...handlers}
        />
      )}
      <DaySheet
        day={day}
        sessions={sessions}
        events={events}
        today={today}
        onClose={() => setDay(null)}
        {...handlers}
      />
    </View>
  );
}
