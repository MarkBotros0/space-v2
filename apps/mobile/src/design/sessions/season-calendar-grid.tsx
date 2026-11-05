/** season-calendar's Week and Month views: one Monday-first 7-column grid of title chips. */
import { Pressable, View } from "react-native";
import type { JpcEventListItem, SessionListItem } from "@space/shared";

import {
  isSameMonth,
  sessionTone,
  visibleKeys,
  WEEKDAYS,
  type CalendarView,
  type SessionTone,
} from "../../lib/calendar-grid";
import { formatDayKey } from "../../lib/format";
import { cn } from "../lib/cn";
import { Text } from "../ui/text";
import { FALLBACK_SEASON, type Handlers } from "./season-colors";

const CHIP_TONE: Record<SessionTone, { box: string; text: string; bar: string }> = {
  today: {
    box: "bg-success-100 dark:bg-success-950",
    bar: "bg-success-600 dark:bg-success-400",
    text: "text-success-800 dark:text-success-200",
  },
  past: { box: "bg-muted", text: "text-muted-foreground", bar: "bg-muted-foreground" },
  upcoming: {
    box: "bg-brand-teal-100 dark:bg-brand-teal-950",
    bar: "bg-brand-teal-600 dark:bg-brand-teal-400",
    text: "text-brand-teal-900 dark:text-brand-teal-200",
  },
};

export function CalendarGrid({
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
    <View className="overflow-hidden rounded-group border border-separator bg-separator" style={{ gap: 1 }}>
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
              >
                {/* Out-of-month dates take the muted foreground (4.5:1 on the cell) rather than
                    v1's dimming, which left them under 3:1. */}
                <View
                  className={cn(
                    "size-6 items-center justify-center self-start rounded-full",
                    isToday && "bg-brand-teal-500",
                  )}
                >
                  <Text
                    className={cn(
                      "text-xs font-medium",
                      isToday ? "text-brand-navy-950" : outside ? "text-muted-foreground" : "text-foreground",
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
                          <View className={cn("h-2 rounded-sm", tone.bar ?? tone.box)} />
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
                          <View
                            className={cn(
                              "h-2 flex-1 rounded-sm",
                              alumni
                                ? "bg-warning-600 dark:bg-warning-400"
                                : "bg-brand-navy-600 dark:bg-brand-navy-300",
                            )}
                          />
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
