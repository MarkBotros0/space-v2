/**
 * Port of v1 components/sessions/attendance-form.tsx (presentational): the
 * quick mark-all bar, one card per student with Present / Late / Absent
 * toggles (+ minutes late), the error box, and the save bar. The screen owns
 * state and the write (touched rows only, notes kept — spec 04 R13/R16).
 * Native differences: ring-1 → border; v1's `sticky bottom-24` bar becomes a
 * bar pinned 16px above the floating tab bar (whose bottom follows the
 * safe-area inset), with a spacer closing the list so the last row stays
 * reachable.
 */

/** The floating tab bar: bottom max(16, inset), 64px tall (floating-tab-bar.tsx). */
const TAB_BAR_HEIGHT = 64;
/** The save bar: one row of 36px buttons, 12px padding and borders. */
const SAVE_BAR_HEIGHT = 62;

function useSaveBarBottom(): number {
  const insets = useSafeAreaInsets();
  return Math.max(16, insets.bottom) + TAB_BAR_HEIGHT + 16;
}
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";
import { Check, Clock, X, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useShellBottomPadding } from "../layout/shell-context";
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
  const barBottom = useSaveBarBottom();
  // ShellFrame's own bottom padding, which already clears the tab bar.
  const frameBottom = useShellBottomPadding();
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
      {/* Room for the floating save bar. */}
      <View testID="save-bar-spacer" style={{ height: SAVE_BAR_HEIGHT + barBottom - frameBottom }} />
    </View>
  );
}

/** v1's save bar, as one row (Cancel, Save): v1's stacked buttons covered the next student on a phone. */
export function AttendanceSaveBar({ pending, onSave, onCancel }: { pending: boolean; onSave: () => void; onCancel: () => void }): ReactNode {
  const bottom = useSaveBarBottom();
  return (
    <View
      accessibilityLabel="Save bar"
      className="z-10 flex-row items-center gap-2 rounded-lg border border-border bg-card p-3"
      // Inset offsets as a style: NativeWind left the inset classes unresolved here.
      style={[{ position: "absolute", left: 16, right: 16, bottom }, shadowStyle("sm")]}
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
