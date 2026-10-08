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
import { useTheme } from "../../theme";
import { Text } from "../../ui";
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
  const theme = useTheme();
  return (
    <>
      {keys.map((key) => {
        const entries = entriesFor(byDay.get(key));
        return (
          <View key={key} style={{ marginBottom: theme.spacing.md }}>
            <Text variant="heading" color={key === ctx.today ? theme.colors.success[800] : undefined}>
              {formatWeekdayDay(key)}
            </Text>
            {entries.length === 0 ? (
              <Text variant="caption" color={theme.colors.neutral[600]}>
                Nothing scheduled
              </Text>
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
  const theme = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const inGrid = (k: string | null): k is string => k !== null && keys.includes(k);
  const fallback = inGrid(ctx.today) && isSameMonth(ctx.today, anchor) ? ctx.today : `${anchor.slice(0, 7)}-01`;
  const selected = inGrid(picked) ? picked : fallback;

  const rows: string[][] = [];
  for (let i = 0; i < keys.length; i += 7) rows.push(keys.slice(i, i + 7));

  return (
    <>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: "center", paddingVertical: theme.spacing.xs }}>
            <Text variant="caption" color={theme.colors.neutral[600]}>
              {d}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]} style={{ flexDirection: "row" }}>
          {row.map((key) => {
            const day = byDay.get(key);
            const count = (day?.sessions.length ?? 0) + (day?.events.length ?? 0);
            const dots = [
              ...(day?.sessions ?? []).map((s) => sessionTint(theme, s, ctx).foreground),
              ...(day?.events ?? []).map((e) => eventTint(theme, e).foreground),
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
                style={{
                  flex: 1,
                  minHeight: 56,
                  alignItems: "center",
                  paddingVertical: theme.spacing.xs,
                  // v1 dims days outside the anchor month.
                  opacity: isSameMonth(key, anchor) ? 1 : 0.4,
                  backgroundColor: isSelected ? theme.colors.brand.teal[100] : theme.colors.transparent,
                  borderRadius: theme.radii.sm,
                }}
              >
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: theme.radii.full,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isToday ? theme.colors.brand.teal[500] : theme.colors.transparent,
                  }}
                >
                  <Text variant="label" color={isToday ? theme.colors.brand.navy[950] : undefined}>
                    {String(Number(key.slice(8, 10)))}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 2, marginTop: 2, alignItems: "center" }}>
                  {dots.slice(0, MAX_DOTS).map((color, i) => (
                    <View key={i} style={{ width: 6, height: 6, borderRadius: theme.radii.full, backgroundColor: color }} />
                  ))}
                  {dots.length > MAX_DOTS ? (
                    <Text variant="caption" color={theme.colors.neutral[600]}>
                      {`+${dots.length - MAX_DOTS}`}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={{ marginTop: theme.spacing.md }}>
        <Text variant="heading">{formatDayKey(selected)}</Text>
        {entriesFor(byDay.get(selected)).length === 0 ? (
          <Text variant="caption" color={theme.colors.neutral[600]}>
            Nothing scheduled
          </Text>
        ) : (
          <DayEntries entries={entriesFor(byDay.get(selected))} ctx={ctx} />
        )}
      </View>
    </>
  );
}
