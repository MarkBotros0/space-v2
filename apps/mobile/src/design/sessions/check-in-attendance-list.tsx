/**
 * Port of v1 components/sessions/check-in-attendance-list.tsx: the session's
 * roster with a status chip (or neutral "Not recorded") and an "Edit" button
 * that opens v1's "Override attendance" sheet. The screen owns the write.
 * Native differences: no check-in time under the name (the roster carries no
 * `checkedInAt`, gap note); polling lives in the screen. This list also
 * serves the admin session page.
 */
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Button } from "../ui/button";
import { Sheet } from "../ui/sheet";
import { StatusChip, statusChip } from "../ui/status-chip";
import { Text } from "../ui/text";

const ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT"];

export function CheckInAttendanceList({
  rows,
  pending,
  error,
  onOverride,
}: {
  rows: AttendanceRosterRow[];
  pending: boolean;
  /** The last override's failure, shown inside the sheet (the card is behind it). */
  error: string | null;
  /** Resolves when the write settles; the sheet closes on success. */
  onOverride: (row: AttendanceRosterRow, status: AttendanceStatus, done: () => void) => void;
}) {
  const [editing, setEditing] = useState<AttendanceRosterRow | null>(null);
  const nameOf = (r: AttendanceRosterRow) => r.name ?? r.email;

  if (rows.length === 0) {
    return <Text variant="subhead" className="py-4 text-center text-muted-foreground">No students have scanned yet.</Text>;
  }

  return (
    <>
      <View className="flex-col">
        {rows.map((r, i) => (
          <View
            key={r.studentUserId}
            className={cn(
              "flex-row items-center justify-between gap-3 py-2",
              i === 0 && "pt-0",
              i === rows.length - 1 && "pb-0",
              i > 0 && "border-t border-border",
            )}
          >
            <View className="min-w-0 flex-1 flex-col gap-0.5">
              <Text variant="body" numberOfLines={2}>{nameOf(r)}</Text>
            </View>
            <View className="shrink-0 flex-row items-center gap-2">
              {r.status !== null ? (
                <StatusChip {...statusChip("attendance", r.status)} />
              ) : (
                <StatusChip tone="neutral" label="Not recorded" />
              )}
              <Button
                variant="secondary"
                size="sm"
                accessibilityLabel={`Edit attendance for ${nameOf(r)}`}
                onPress={() => setEditing(r)}
              >
                Edit
              </Button>
            </View>
          </View>
        ))}
      </View>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title="Override attendance">
        <View className="flex-col gap-3 pb-4">
          <Text variant="subhead" className="text-muted-foreground">
            {editing ? nameOf(editing) : ""}
          </Text>
          {ORDER.map((status) => (
            <Button
              key={status}
              variant="secondary"
              className="w-full"
              disabled={pending}
              accessibilityLabel={editing ? `Mark ${nameOf(editing)} ${status}` : status}
              onPress={() => {
                if (editing) onOverride(editing, status, () => setEditing(null));
              }}
            >
              {statusChip("attendance", status).label}
            </Button>
          ))}
          {error ? (
            <Text testID="override-error" variant="subhead" className="rounded-control bg-bad-soft px-3 py-2 text-bad">
              {error}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
