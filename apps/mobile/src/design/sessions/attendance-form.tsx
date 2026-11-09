/**
 * Port of v1 components/sessions/attendance-form.tsx (presentational): the
 * quick mark-all card, one GroupedList row per student with Present / Late /
 * Absent toggles (+ minutes late) and the error box. The screen owns state,
 * the pinned save bar (Screen's footer) and the write (touched rows only,
 * notes kept: spec 04 R13/R16).
 * Toggles fill the row, 44pt tall (min-h, never h-*). The row wraps when
 * icon + word do not fit one line (360dp at font 1.3) rather than breaking a
 * word, and the label keeps whole words (numberOfLines 1 inside a wrapped
 * toggle that takes the full width).
 */
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";
import { Check, Clock, X, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { haptic } from "../motion";
import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { Button } from "../ui/button";
import { GroupedList } from "../ui/grouped-list";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

iconWithClassName(Check, Clock, X);

const OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: LucideIcon;
  active: string;
  text: string;
}[] = [
  {
    value: "PRESENT",
    label: "Present",
    icon: Check,
    active: "border-transparent bg-ok-soft",
    text: "text-ok",
  },
  {
    value: "LATE",
    label: "Late",
    icon: Clock,
    active: "border-transparent bg-warn-soft",
    text: "text-warn",
  },
  {
    value: "ABSENT",
    label: "Absent",
    icon: X,
    active: "border-transparent bg-bad-soft",
    text: "text-bad",
  },
];

export function AttendanceRosterForm({
  rows,
  statusOf,
  lateTextOf,
  pending,
  onMark,
  onMarkAll,
  onLateText,
}: {
  rows: AttendanceRosterRow[];
  statusOf: (row: AttendanceRosterRow) => AttendanceStatus | null;
  lateTextOf: (row: AttendanceRosterRow) => string;
  pending: boolean;
  onMark: (row: AttendanceRosterRow, status: AttendanceStatus) => void;
  onMarkAll: (status: AttendanceStatus) => void;
  onLateText: (row: AttendanceRosterRow, text: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text variant="subhead" className="rounded-group bg-surface p-8 text-center text-muted-foreground">
        No students are enrolled in this scope.
      </Text>
    );
  }
  return (
    <View className="flex-col gap-4">
      <View className="flex-col gap-2 rounded-group bg-surface p-4">
        <Text variant="subhead" className="text-muted-foreground">
          Quick mark all as
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {OPTIONS.map((o) => (
            <Button
              key={o.value}
              variant="secondary"
              size="sm"
              disabled={pending}
              accessibilityLabel={`Mark all ${o.value}`}
              onPress={() => onMarkAll(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </View>
      </View>

      <GroupedList>
        {rows.map((row) => {
          const name = row.name ?? row.email;
          const current = statusOf(row);
          return (
            <View key={row.studentUserId} className="flex-col gap-3 px-4 py-3">
              <View className="min-w-0">
                <Text variant="body" numberOfLines={2}>
                  {name}
                </Text>
                <Text variant="caption" numberOfLines={2} className="text-muted-foreground">
                  {row.groupName ? `${row.groupName} · ${row.email}` : row.email}
                </Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {OPTIONS.map((o) => {
                  const active = current === o.value;
                  const Icon = o.icon;
                  return (
                    <Pressable
                      key={o.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Mark ${name} ${o.value}`}
                      accessibilityState={{ selected: active, disabled: pending }}
                      disabled={pending}
                      onPress={() => {
                        haptic("selection");
                        onMark(row, o.value);
                      }}
                      className={cn(
                        "min-h-[44px] min-w-[96px] flex-1 flex-row items-center justify-center gap-1.5 rounded-control border px-2",
                        active ? o.active : "border-control-border",
                      )}
                    >
                      <Icon size={16} className={active ? o.text : "text-muted-foreground"} />
                      <Text
                        variant="subhead"
                        numberOfLines={1}
                        className={cn("font-medium", active ? o.text : "text-muted-foreground")}
                      >
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {current === "LATE" ? (
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text variant="subhead" className="font-medium text-muted-foreground">
                    Minutes late
                  </Text>
                  <Input
                    accessibilityLabel={`Minutes late for ${name}`}
                    keyboardType="number-pad"
                    value={lateTextOf(row)}
                    onChangeText={(t) => onLateText(row, t)}
                    editable={!pending}
                    className="w-24"
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </GroupedList>
    </View>
  );
}
