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
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  MapPin,
} from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import {
  dayCue,
  isSameMonth,
  rangeLabel,
  sessionTone,
  stepAnchor,
  visibleKeys,
  WEEKDAYS,
  type CalendarView,
  type SessionTone,
} from "../../lib/calendar-grid";
import { groupCalendarByDay } from "../../lib/day-groups";
import { formatDayKey, formatLongDay, splitWallTime } from "../../lib/format";
import { Eyebrow } from "../layout/page-title";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Text } from "../ui/text";

iconWithClassName(CalendarIcon, ChevronLeft, ChevronRight, ExternalLink, Lock, MapPin);

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

type Handlers = {
  onOpenSession: (id: number) => void;
  onOpenEvent: (event: JpcEventListItem) => void;
  /** Season code → chip colours; present only on SUPER's all-seasons calendar. */
  seasonColors?: SeasonColors;
};

export type SeasonColor = { box: string; text: string };
export type SeasonColors = Record<string, SeasonColor>;

/** v1 SEASON_PALETTE: `bg-X-800 text-X-300` chips that read the same in both themes. */
export const SEASON_PALETTE: SeasonColor[] = [
  { box: "bg-info-800", text: "text-info-300" },
  { box: "bg-success-800", text: "text-success-300" },
  { box: "bg-warning-800", text: "text-warning-300" },
  { box: "bg-error-800", text: "text-error-300" },
  { box: "bg-brand-navy-700", text: "text-brand-teal-300" },
];
const FALLBACK_SEASON: SeasonColor = { box: "bg-brand-navy-800", text: "text-brand-teal-400" };

/** v1 builds the map from the season codes in first-seen order, cycling the palette. */
export function buildSeasonColors(sessions: { seasonCode: string }[]): SeasonColors {
  const out: SeasonColors = {};
  for (const code of new Set(sessions.map((s) => s.seasonCode))) {
    out[code] = SEASON_PALETTE[Object.keys(out).length % SEASON_PALETTE.length]!;
  }
  return out;
}

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

function TimeRail({ time }: { time: string | null }) {
  const { clock, meridiem } = splitWallTime(time);
  return (
    <View className="w-12 shrink-0 flex-col items-center justify-center">
      <Text className="text-sm font-bold leading-none text-foreground">{clock}</Text>
      <Text className="mt-0.5 text-[10px] uppercase text-muted-foreground">{meridiem}</Text>
    </View>
  );
}

const ROW =
  "flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:bg-accent";

function AgendaSession({
  s,
  onOpenSession,
  seasonColors,
}: {
  s: SessionListItem;
  onOpenSession: (id: number) => void;
  seasonColors?: SeasonColors;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => onOpenSession(s.id)}
      className={ROW}
      style={shadowStyle("soft")}
    >
      <TimeRail time={s.startTime} />
      <View className="h-10 w-px shrink-0 bg-border" />
      <View className="min-w-0 flex-1">
        <Text
          numberOfLines={1}
          className="text-sm font-semibold text-brand-navy-900 dark:text-foreground"
        >
          {s.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-2">
          <Text className="text-xs text-muted-foreground">{`${s.durationMinutes} min`}</Text>
          {s.location ? (
            <View className="flex-row items-center gap-1">
              <MapPin size={12} className="shrink-0 text-muted-foreground" />
              <Text className="text-xs text-muted-foreground">{s.location}</Text>
            </View>
          ) : null}
          {seasonColors ? (
            <View
              className={cn(
                "rounded px-1.5 py-0.5",
                (seasonColors[s.seasonCode] ?? FALLBACK_SEASON).box,
              )}
            >
              <Text
                className={cn(
                  "text-[10px] font-medium",
                  (seasonColors[s.seasonCode] ?? FALLBACK_SEASON).text,
                )}
              >
                {s.seasonCode}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
    </Pressable>
  );
}

function AgendaEvent({
  e,
  onOpenEvent,
}: {
  e: JpcEventListItem;
  onOpenEvent: (e: JpcEventListItem) => void;
}) {
  return (
    <Pressable
      accessibilityRole={e.url ? "link" : "button"}
      onPress={() => onOpenEvent(e)}
      className={ROW}
      style={shadowStyle("soft")}
    >
      <View className="w-12 shrink-0 items-center justify-center">
        <CalendarIcon size={16} className="text-muted-foreground" />
      </View>
      <View className="h-10 w-px shrink-0 bg-border" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          {e.visibility === "ALUMNI_ONLY" ? (
            <Lock size={12} className="shrink-0 text-brand-navy-900 dark:text-foreground" />
          ) : null}
          <Text
            numberOfLines={1}
            className="shrink text-sm font-semibold text-brand-navy-900 dark:text-foreground"
          >
            {e.title}
          </Text>
        </View>
        <Text className="text-xs text-muted-foreground">JPC event</Text>
      </View>
      {e.url ? <ExternalLink size={16} className="shrink-0 text-muted-foreground" /> : null}
    </Pressable>
  );
}

function AgendaView({
  sessions,
  events,
  today,
  ...handlers
}: { sessions: SessionListItem[]; events: JpcEventListItem[]; today: string } & Handlers) {
  const groups = groupCalendarByDay(
    sessions.filter((s) => s.dayKey >= today),
    events.filter((e) => e.dayKey >= today),
  );
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={CalendarIcon}
        title="Nothing coming up"
        description="You're all caught up. Switch to Month to review past sessions."
      />
    );
  }
  return (
    <View className="flex-col gap-5">
      {groups.map((group) => {
        const cue = dayCue(group.dayKey, today);
        return (
          <View key={group.dayKey} className="flex-col gap-2">
            <View className="flex-row items-baseline justify-between gap-2">
              <Eyebrow>{formatLongDay(group.dayKey)}</Eyebrow>
              {cue ? (
                <Text className="text-[10px] font-medium text-brand-teal-700 dark:text-brand-teal-300">
                  {cue}
                </Text>
              ) : null}
            </View>
            {group.entries.map((entry) =>
              entry.kind === "session" ? (
                <AgendaSession
                  key={`s${entry.session.id}`}
                  s={entry.session}
                  onOpenSession={handlers.onOpenSession}
                  seasonColors={handlers.seasonColors}
                />
              ) : (
                <AgendaEvent
                  key={`e${entry.event.id}`}
                  e={entry.event}
                  onOpenEvent={handlers.onOpenEvent}
                />
              ),
            )}
          </View>
        );
      })}
    </View>
  );
}

const CHIP_TONE: Record<SessionTone, { box: string; text: string }> = {
  today: {
    box: "bg-success-100 dark:bg-success-950",
    text: "text-success-800 dark:text-success-200",
  },
  past: { box: "bg-muted", text: "text-muted-foreground" },
  upcoming: {
    box: "bg-brand-teal-100 dark:bg-brand-teal-950",
    text: "text-brand-teal-800 dark:text-brand-teal-200",
  },
};

function CalendarGrid({
  view,
  anchor,
  sessions,
  events,
  today,
  ...handlers
}: {
  view: Exclude<CalendarView, "upcoming">;
  anchor: string;
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  today: string;
} & Handlers) {
  const keys = visibleKeys(view, anchor);
  // A month cell is ~40dp wide on a phone: a title breaks mid-word, so month shows colour bars and
  // the title lives in the accessibility label; Week and Upcoming carry the text.
  const compact = view === "month";
  const weeks: string[][] = [];
  for (let i = 0; i < keys.length; i += 7) weeks.push(keys.slice(i, i + 7));
  return (
    // v1: grid gap-px over bg-border draws the 1px lines.
    <View className="overflow-hidden rounded-xl border border-border bg-border" style={{ gap: 1 }}>
      <View className="flex-row" style={{ gap: 1 }}>
        {WEEKDAYS.map((d) => (
          <View key={d} className="flex-1 bg-card py-2">
            <Text className="text-center text-xs font-medium text-muted-foreground">{d}</Text>
          </View>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} className="flex-row" style={{ gap: 1 }}>
          {week.map((key) => {
            const outside = view === "month" && !isSameMonth(key, anchor);
            const isToday = key === today;
            return (
              <View
                key={key}
                accessibilityLabel={formatDayKey(key)}
                className={cn(
                  "min-w-0 flex-1 flex-col gap-0.5 bg-card p-0.5",
                  view === "week" ? "min-h-32" : "min-h-[72px]",
                )}
                // v1 dims out-of-month days to opacity-40; 40% leaves their date at under 3:1, so 60%.
                style={outside ? { opacity: 0.6 } : undefined}
              >
                <View
                  className={cn(
                    "size-6 items-center justify-center self-start rounded-full",
                    isToday && "bg-brand-teal-500",
                  )}
                >
                  <Text
                    className={cn(
                      "text-xs font-medium",
                      isToday ? "text-brand-navy-950" : "text-foreground",
                    )}
                  >
                    {String(Number(key.slice(8)))}
                  </Text>
                </View>
                {sessions
                  .filter((s) => s.dayKey === key)
                  .map((s) => {
                    const tone = handlers.seasonColors
                      ? (handlers.seasonColors[s.seasonCode] ?? FALLBACK_SEASON)
                      : CHIP_TONE[sessionTone(s.dayKey, today)];
                    return (
                      <Pressable
                        key={s.id}
                        accessibilityRole="link"
                        accessibilityLabel={s.title}
                        onPress={() => handlers.onOpenSession(s.id)}
                        className={cn("rounded px-0.5 py-0.5", tone.box)}
                      >
                        {compact ? (
                          <View className="h-2" />
                        ) : (
                          <Text
                            numberOfLines={2}
                            maxFontSizeMultiplier={1}
                            className={cn("text-[10px] font-medium leading-tight", tone.text)}
                          >
                            {s.title}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                {events
                  .filter((e) => e.dayKey === key)
                  .map((e) => {
                    const alumni = e.visibility === "ALUMNI_ONLY";
                    return (
                      <Pressable
                        key={`e${e.id}`}
                        accessibilityRole={e.url ? "link" : "button"}
                        accessibilityLabel={e.title}
                        onPress={() => handlers.onOpenEvent(e)}
                        className={cn(
                          "flex-row items-center gap-0.5 rounded px-0.5 py-0.5",
                          alumni
                            ? "bg-warning-100 dark:bg-warning-950"
                            : "bg-brand-navy-100 dark:bg-brand-navy-900",
                        )}
                      >
                        {compact ? (
                          <View className="h-2 flex-1" />
                        ) : (
                          <Text
                            numberOfLines={2}
                            maxFontSizeMultiplier={1}
                            className={cn(
                              "shrink text-[10px] leading-tight",
                              alumni
                                ? "text-warning-800 dark:text-warning-200"
                                : "text-brand-navy-800 dark:text-brand-navy-100",
                            )}
                          >
                            {e.title}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
              </View>
            );
          })}
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
