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
import { Pressable, View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import { rangeLabel, stepAnchor, type CalendarView } from "../../lib/calendar-grid";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Button } from "../ui/button";
import { Text } from "../ui/text";
import { AgendaView } from "./season-calendar-agenda";
import { CalendarGrid } from "./season-calendar-grid";
import type { Handlers, SeasonColors } from "./season-colors";

export {
  buildSeasonColors,
  type SeasonColor,
  type SeasonColors,
} from "./season-colors";

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

/** v1's hand-rolled segmented control (not ui/tabs). */
function ViewSwitch({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Calendar view"
      className="flex-row self-start rounded-xl border border-border bg-muted/40 p-0.5"
    >
      {VIEWS.map((v) => {
        const selected = v.value === value;
        return (
          <Pressable
            key={v.value}
            accessibilityRole="tab"
            accessibilityLabel={v.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(v.value)}
            className={cn("rounded-lg px-3 py-1.5", selected && "bg-card")}
            style={selected ? shadowStyle("soft") : undefined}
          >
            <Text
              className={cn(
                "text-sm font-medium",
                selected ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {v.label}
            </Text>
          </Pressable>
        );
      })}
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
  const handlers = { onOpenSession, onOpenEvent, seasonColors };

  return (
    <View className="flex-col gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <ViewSwitch value={view} onChange={setView} />
        {view !== "upcoming" ? (
          <View className="flex-row items-center gap-1">
            <Button
              variant="ghost"
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
              variant="ghost"
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
          {...handlers}
        />
      )}
    </View>
  );
}
