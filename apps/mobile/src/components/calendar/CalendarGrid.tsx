import { useState } from "react";
import { Pressable, View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import {
  WEEKDAYS,
  bucketByDay,
  isSameMonth,
  visibleKeys,
  type CalendarView,
} from "../../lib/calendar-grid";
import { formatDayKey, formatWeekdayDay } from "../../lib/format";
import { cn } from "../../design/lib/cn";
import { Text } from "../../design/ui/text";
import { DayEntries, entriesFor, eventTint, sessionTint, type CalendarContext } from "./CalendarEntries";

const MAX_DOTS = 3;

export interface CalendarGridProps {
  view: Exclude<CalendarView, "upcoming">;
  anchor: string;
  sessions: SessionListItem[];
  events: JpcEventListItem[];
  ctx: CalendarContext;
}

/**
 * v1's Week and Month views (REG-75), in phone proportions. Month is the
 * seven-column Mon-Sun grid with out-of-month days dimmed and today ringed;
 * a day's chips are dots here, and tapping a day lists it underneath because
 * a 50 px column cannot hold a title. Week is the same seven days as stacked
 * rows, each with its full cards.
 */
export function CalendarGrid({ view, anchor, sessions, events, ctx }: CalendarGridProps) {
  const byDay = bucketByDay(sessions, events);
  const keys = visibleKeys(view, anchor);
  return view === "week" ? (
    <WeekRows keys={keys} byDay={byDay} ctx={ctx} />
  ) : (
    <MonthGrid keys={keys} anchor={anchor} byDay={byDay} ctx={ctx} />
  );
}

type ByDay = ReturnType<typeof bucketByDay>;

function WeekRows({ keys, byDay, ctx }: { keys: string[]; byDay: ByDay; ctx: CalendarContext }) {
  return (
    <>
      {keys.map((key) => {
        const entries = entriesFor(byDay.get(key));
        return (
          <View key={key} className="mb-4">
            <Text
              className={cn(
                "text-lg font-semibold",
                key === ctx.today && "text-success-800 dark:text-success-200",
              )}
            >
              {formatWeekdayDay(key)}
            </Text>
            {entries.length === 0 ? (
              <Text className="text-xs text-muted-foreground">Nothing scheduled</Text>
            ) : (
              <DayEntries entries={entries} ctx={ctx} />
            )}
          </View>
        );
      })}
    </>
  );
}

function MonthGrid({
  keys,
  anchor,
  byDay,
  ctx,
}: {
  keys: string[];
  anchor: string;
  byDay: ByDay;
  ctx: CalendarContext;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const inGrid = (k: string | null): k is string => k !== null && keys.includes(k);
  const fallback = inGrid(ctx.today) && isSameMonth(ctx.today, anchor) ? ctx.today : `${anchor.slice(0, 7)}-01`;
  const selected = inGrid(picked) ? picked : fallback;

  const rows: string[][] = [];
  for (let i = 0; i < keys.length; i += 7) rows.push(keys.slice(i, i + 7));

  return (
    <>
      <View className="flex-row">
        {WEEKDAYS.map((d) => (
          <View key={d} className="flex-1 items-center py-1">
            <Text className="text-xs text-muted-foreground">{d}</Text>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]} className="flex-row">
          {row.map((key) => {
            const day = byDay.get(key);
            const count = (day?.sessions.length ?? 0) + (day?.events.length ?? 0);
            const dots = [
              ...(day?.sessions ?? []).map((s) => sessionTint(s, ctx).dot),
              ...(day?.events ?? []).map((e) => eventTint(e).dot),
            ];
            const isToday = key === ctx.today;
            const isSelected = key === selected;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${formatDayKey(key)}, ${count === 0 ? "nothing scheduled" : `${count} scheduled`}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => setPicked(key)}
                className={cn(
                  "min-h-14 flex-1 items-center rounded-[10px] py-1",
                  isSelected && "bg-brand-teal-100 dark:bg-brand-teal-950",
                  // v1 dims days outside the anchor month.
                  !isSameMonth(key, anchor) && "opacity-40",
                )}
              >
                <View
                  className={cn(
                    "size-[26px] items-center justify-center rounded-full",
                    isToday && "bg-brand-teal-500",
                  )}
                >
                  <Text className={cn("text-sm font-medium", isToday && "text-brand-navy-950")}>
                    {String(Number(key.slice(8, 10)))}
                  </Text>
                </View>
                <View className="mt-0.5 flex-row items-center gap-0.5">
                  {dots.slice(0, MAX_DOTS).map((dot, i) => (
                    <View key={i} className={cn("size-1.5 rounded-full", dot)} />
                  ))}
                  {dots.length > MAX_DOTS ? (
                    <Text className="text-xs text-muted-foreground">{`+${dots.length - MAX_DOTS}`}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View className="mt-4">
        <Text className="text-lg font-semibold">{formatDayKey(selected)}</Text>
        {entriesFor(byDay.get(selected)).length === 0 ? (
          <Text className="text-xs text-muted-foreground">Nothing scheduled</Text>
        ) : (
          <DayEntries entries={entriesFor(byDay.get(selected))} ctx={ctx} />
        )}
      </View>
    </>
  );
}
