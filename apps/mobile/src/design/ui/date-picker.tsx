/**
 * Port of v1 src/components/ui/date-picker.tsx — v1's own month grid (not
 * the OS picker): same "PPP" trigger format, "MMMM yyyy" header, Sun-first
 * weekdays, h-9 w-9 day cells, today/selected styles.
 * Native differences: Base UI Popover → AnchoredPopover; grid-cols-7 → rows
 * of seven; ring-1 ring-inset (today) → border; hover:bg-muted → active:.
 */
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { AnchoredPopover, useAnchor } from "../lib/anchored-popover";
import { iconWithClassName } from "../lib/icon";
import { cn } from "../lib/cn";
import { Button } from "./button";
import { Text } from "./text";

iconWithClassName(CalendarIcon, ChevronLeft, ChevronRight);

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
}: {
  value: Date | null;
  onChange: (date: Date) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaInvalid?: boolean;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(value ?? new Date());
  const [trackedValue, setTrackedValue] = useState<Date | null>(value ?? null);
  if (value && (!trackedValue || value.getTime() !== trackedValue.getTime())) {
    setTrackedValue(value);
    setViewMonth(value);
  }
  const anchor = useAnchor();
  const days = useMemo(() => getMonthGrid(viewMonth), [viewMonth]);
  const weeks = useMemo(() => Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7)), [days]);
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
          setOpen(true);
        }}
        className={cn(
          "h-10 w-full flex-row items-center justify-between gap-2 rounded-md border border-input bg-background px-3",
          ariaInvalid && "border-destructive",
          disabled && "opacity-50",
          className,
        )}
      >
        <Text className={cn("text-sm", value ? "text-foreground" : "text-muted-foreground")}>
          {value ? format(value, "PPP") : placeholder}
        </Text>
        <CalendarIcon size={16} className="text-muted-foreground" />
      </Pressable>
      <AnchoredPopover open={open} onClose={() => setOpen(false)} anchor={anchor.rect}>
        <View className="rounded-lg border border-border bg-popover p-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Button size="icon-sm" variant="ghost" onPress={() => setViewMonth((m) => subMonths(m, 1))} accessibilityLabel="Previous month">
              <ChevronLeft size={16} className="text-foreground" />
            </Button>
            <Text className="text-sm font-medium text-popover-foreground">{format(viewMonth, "MMMM yyyy")}</Text>
            <Button size="icon-sm" variant="ghost" onPress={() => setViewMonth((m) => addMonths(m, 1))} accessibilityLabel="Next month">
              <ChevronRight size={16} className="text-foreground" />
            </Button>
          </View>
          <View className="flex-row gap-0.5">
            {WEEKDAYS.map((w) => (
              <Text key={w} className="w-9 py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
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
                          !isCurrentMonth && "text-muted-foreground/50",
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
        </View>
      </AnchoredPopover>
    </>
  );
}

export { DatePicker };
