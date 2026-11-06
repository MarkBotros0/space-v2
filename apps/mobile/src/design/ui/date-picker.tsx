/**
 * Port of v1 src/components/ui/date-picker.tsx — v1's own month grid (not
 * the OS picker): "PP" trigger format ("Oct 5, 2026", the app's date format), "MMMM yyyy" header, Sun-first
 * weekdays, h-9 w-9 day cells, today/selected styles.
 * Native differences: Base UI Popover → AnchoredPopover; grid-cols-7 → rows
 * of seven; ring-1 ring-inset (today) → border; hover:bg-muted → active:.
 *
 * Jumping years (owner, 2026-11-06 — reaching 1999 a month at a time was
 * unusable): the "MMMM yyyy" title is a button that opens a year grid (twelve
 * a page), then a month grid, then the days. `startWith="year"` opens on the
 * years — for a date of birth.
 */
import {
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Text } from "./text";

iconWithClassName(CalendarIcon, ChevronDown, ChevronLeft, ChevronRight);

type View3 = "day" | "month" | "year";
const YEARS_PER_PAGE = 12;
/** First year of the 12-year page holding `year`. */
const pageStart = (year: number) =>
  year - (((year % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE);
const MONTHS = Array.from({ length: 12 }, (_, i) => i);
const rowsOf = <T,>(items: T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / n) }, (_, i) => items.slice(i * n, i * n + n));

function getMonthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  ariaInvalid,
  accessibilityLabel,
  startWith = "day",
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaInvalid?: boolean;
  accessibilityLabel?: string;
  /** "year": open on the year grid (a date of birth); default: the month's days. */
  startWith?: "day" | "year";
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<View3>("day");
  const [viewMonth, setViewMonth] = useState<Date>(value ?? new Date());
  const [trackedValue, setTrackedValue] = useState<Date | null>(value ?? null);
  if (value && (!trackedValue || value.getTime() !== trackedValue.getTime())) {
    setTrackedValue(value);
    setViewMonth(value);
  }
  const anchor = useAnchor();
  const days = useMemo(() => getMonthGrid(viewMonth), [viewMonth]);
  const weeks = useMemo(
    () => Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7)),
    [days],
  );
  const today = new Date();

  return (
    <>
      <Pressable
        ref={anchor.ref}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        onPress={() => {
          anchor.measure();
          setMode(startWith === "year" && !value ? "year" : "day");
          setOpen(true);
        }}
        className={cn(
          "min-h-[44px] w-full flex-row items-center justify-between gap-2 rounded-control border border-control-border bg-surface px-3",
          ariaInvalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
      >
        <Text className={cn("text-base", value ? "text-foreground" : "text-muted-foreground")}>
          {value ? format(value, "PP") : placeholder}
        </Text>
        <CalendarIcon size={16} className="text-muted-foreground" />
      </Pressable>
      <AnchoredPopover open={open} onClose={() => setOpen(false)} anchor={anchor.rect}>
        <View className="rounded-group border border-separator bg-popover p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Button
              size="icon-sm"
              variant="ghost"
              onPress={() =>
                setViewMonth((m) =>
                  mode === "day"
                    ? subMonths(m, 1)
                    : mode === "month"
                      ? subYears(m, 1)
                      : subYears(m, YEARS_PER_PAGE),
                )
              }
              accessibilityLabel={
                mode === "day"
                  ? "Previous month"
                  : mode === "month"
                    ? "Previous year"
                    : "Earlier years"
              }
            >
              <ChevronLeft size={16} className="text-foreground" />
            </Button>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                mode === "day"
                  ? `${format(viewMonth, "MMMM yyyy")}, choose month and year`
                  : mode === "month"
                    ? `${format(viewMonth, "yyyy")}, choose year`
                    : "Back to days"
              }
              onPress={() =>
                setMode((m) => (m === "day" ? "year" : m === "month" ? "year" : "day"))
              }
              className="min-h-[44px] flex-row items-center gap-1 rounded-md px-2 active:bg-muted"
            >
              <Text className="text-sm font-medium text-popover-foreground">
                {mode === "day"
                  ? format(viewMonth, "MMMM yyyy")
                  : mode === "month"
                    ? format(viewMonth, "yyyy")
                    : `${pageStart(viewMonth.getFullYear())} – ${pageStart(viewMonth.getFullYear()) + YEARS_PER_PAGE - 1}`}
              </Text>
              <ChevronDown size={14} className="text-muted-foreground" />
            </Pressable>
            <Button
              size="icon-sm"
              variant="ghost"
              onPress={() =>
                setViewMonth((m) =>
                  mode === "day"
                    ? addMonths(m, 1)
                    : mode === "month"
                      ? addYears(m, 1)
                      : addYears(m, YEARS_PER_PAGE),
                )
              }
              accessibilityLabel={
                mode === "day" ? "Next month" : mode === "month" ? "Next year" : "Later years"
              }
            >
              <ChevronRight size={16} className="text-foreground" />
            </Button>
          </View>
          {mode === "year" ? (
            <View testID="date-picker-years" className="gap-1" style={{ width: 7 * 36 + 6 * 2 }}>
              {rowsOf(
                Array.from(
                  { length: YEARS_PER_PAGE },
                  (_, i) => pageStart(viewMonth.getFullYear()) + i,
                ),
                3,
              ).map((row) => (
                <View key={row[0]} className="flex-row gap-1">
                  {row.map((year) => {
                    const selected = value?.getFullYear() === year;
                    return (
                      <Pressable
                        key={year}
                        accessibilityRole="button"
                        accessibilityLabel={String(year)}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setViewMonth((m) => new Date(year, m.getMonth(), 1));
                          setMode("month");
                        }}
                        className={cn(
                          "h-11 flex-1 items-center justify-center rounded-md",
                          selected ? "bg-primary" : "active:bg-muted",
                        )}
                      >
                        <Text
                          className={cn(
                            "text-sm text-popover-foreground",
                            selected && "text-primary-foreground",
                          )}
                        >
                          {year}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : mode === "month" ? (
            <View testID="date-picker-months" className="gap-1" style={{ width: 7 * 36 + 6 * 2 }}>
              {rowsOf(MONTHS, 3).map((row) => (
                <View key={row[0]} className="flex-row gap-1">
                  {row.map((month) => {
                    const date = new Date(viewMonth.getFullYear(), month, 1);
                    const selected = value ? isSameMonth(value, date) : false;
                    return (
                      <Pressable
                        key={month}
                        accessibilityRole="button"
                        accessibilityLabel={format(date, "MMMM yyyy")}
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setViewMonth(date);
                          setMode("day");
                        }}
                        className={cn(
                          "h-11 flex-1 items-center justify-center rounded-md",
                          selected ? "bg-primary" : "active:bg-muted",
                        )}
                      >
                        <Text
                          className={cn(
                            "text-sm text-popover-foreground",
                            selected && "text-primary-foreground",
                          )}
                        >
                          {format(date, "MMM")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            <>
              <View className="flex-row gap-0.5">
                {WEEKDAYS.map((w) => (
                  <Text
                    key={w}
                    testID="date-picker-weekday"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1}
                    className="w-9 py-1 text-center text-caption font-medium uppercase text-muted-foreground"
                  >
                    {w}
                  </Text>
                ))}
              </View>
              <View className="gap-0.5">
                {weeks.map((week) => (
                  <View key={week[0]!.toISOString()} className="flex-row gap-0.5">
                    {week.map((d) => {
                      const isCurrentMonth = isSameMonth(d, viewMonth);
                      const isSelected = value ? isSameDay(d, value) : false;
                      const isToday = isSameDay(d, today);
                      return (
                        <Pressable
                          key={d.toISOString()}
                          accessibilityRole="button"
                          accessibilityLabel={format(d, "PPP")}
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => {
                            onChange(d);
                            setOpen(false);
                          }}
                          className={cn(
                            "h-9 w-9 items-center justify-center rounded-md",
                            isCurrentMonth && !isSelected && "active:bg-muted",
                            isSelected && "bg-primary",
                            !isSelected && isToday && "border border-brand-teal-500",
                          )}
                        >
                          <Text
                            className={cn(
                              "text-sm text-popover-foreground",
                              !isCurrentMonth && "text-muted-foreground",
                              isSelected && "text-primary-foreground",
                            )}
                          >
                            {format(d, "d")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </AnchoredPopover>
    </>
  );
}

export { DatePicker };
