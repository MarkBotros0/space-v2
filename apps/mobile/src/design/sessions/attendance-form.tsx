/**
 * Port of v1 components/sessions/attendance-form.tsx (presentational): the
 * quick mark-all bar, one card per student with Present / Late / Absent
 * toggles (+ minutes late), the error box, and the save bar. The screen owns
 * state and the write (touched rows only, notes kept — spec 04 R13/R16).
 * Native differences: ring-1 → border; v1's `sticky bottom-24` bar sits in
 * the flow after the list (owner ruling 2026-10-21, UI sweep): pinned above
 * the tab bar it covered the first students' buttons on a 360dp phone at 1.3x.
 */
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";
import { Check, Clock, X, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "../lib/cn";
import { iconWithClassName } from "../lib/icon";
import { shadowStyle } from "../lib/shadow";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Text } from "../ui/text";

iconWithClassName(Check, Clock, X);

const OPTIONS: { value: AttendanceStatus; label: string; icon: LucideIcon; active: string; text: string }[] = [
  { value: "PRESENT", label: "Present", icon: Check, active: "border-success-300 bg-success-100", text: "text-success-800" },
  { value: "LATE", label: "Late", icon: Clock, active: "border-warning-300 bg-warning-100", text: "text-warning-800" },
  { value: "ABSENT", label: "Absent", icon: X, active: "border-error-300 bg-error-100", text: "text-error-800" },
];

export function AttendanceRosterForm({
  rows,
  statusOf,
  lateTextOf,
  pending,
  error,
  onMark,
  onMarkAll,
  onLateText,
}: {
  rows: AttendanceRosterRow[];
  statusOf: (row: AttendanceRosterRow) => AttendanceStatus | null;
  lateTextOf: (row: AttendanceRosterRow) => string;
  pending: boolean;
  error: string | null;
  onMark: (row: AttendanceRosterRow, status: AttendanceStatus) => void;
  onMarkAll: (status: AttendanceStatus) => void;
  onLateText: (row: AttendanceRosterRow, text: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        No students are enrolled in this scope.
      </Text>
    );
  }
  return (
    <View className="flex-col gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
        <Text className="text-sm text-muted-foreground">Quick mark all as</Text>
        <View className="flex-row flex-wrap gap-1">
          {OPTIONS.map((o) => (
            <Button
              key={o.value}
              variant="outline"
              size="xs"
              disabled={pending}
              accessibilityLabel={`Mark all ${o.value}`}
              onPress={() => onMarkAll(o.value)}
            >
              {o.label}
            </Button>
          ))}
        </View>
      </View>

      <View className="flex-col gap-2">
        {rows.map((row) => {
          const name = row.name ?? row.email;
          const current = statusOf(row);
          return (
            <View key={row.studentUserId} className="rounded-lg border border-border bg-card p-3">
              <View className="flex-col gap-2">
                <View className="min-w-0">
                  <Text numberOfLines={1} className="font-medium">
                    {name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-muted-foreground">
                    {row.groupName ? `${row.groupName} · ${row.email}` : row.email}
                  </Text>
                </View>
                <View className="flex-row flex-wrap gap-1.5">
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
                        onPress={() => onMark(row, o.value)}
                        className={cn(
                          "h-9 min-w-[3.25rem] flex-row items-center justify-center gap-1 rounded-md border px-2",
                          active ? o.active : "border-border",
                          pending && "opacity-50",
                        )}
                      >
                        <Icon size={14} className={active ? o.text : "text-muted-foreground"} />
                        <Text className={cn("text-xs font-medium", active ? o.text : "text-muted-foreground")}>{o.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {current === "LATE" ? (
                <View className="mt-2 flex-row items-center gap-2">
                  <Text className="text-xs font-medium text-muted-foreground">Minutes late</Text>
                  <Input
                    accessibilityLabel={`Minutes late for ${name}`}
                    keyboardType="number-pad"
                    value={lateTextOf(row)}
                    onChangeText={(t) => onLateText(row, t)}
                    editable={!pending}
                    className="h-9 w-24"
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {error ? (
        <Text className="rounded-md border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800 dark:border-error-900 dark:bg-error-950 dark:text-error-200">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** v1's save bar, as one row (Cancel, Save): v1's stacked buttons covered the next student on a phone. */
export function AttendanceSaveBar({ pending, onSave, onCancel }: { pending: boolean; onSave: () => void; onCancel: () => void }): ReactNode {
  return (
    <View
      accessibilityLabel="Save bar"
      className="flex-row items-center gap-2 rounded-lg border border-border bg-card p-3"
      style={shadowStyle("sm")}
    >
      <Button variant="outline" className="flex-1" disabled={pending} onPress={onCancel}>
        Cancel
      </Button>
      <Button className="flex-[2]" disabled={pending} onPress={onSave}>
        {pending ? "Saving…" : "Save attendance"}
      </Button>
    </View>
  );
}
