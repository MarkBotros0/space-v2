/**
 * The session's roster (v1 components/sessions/check-in-attendance-list.tsx)
 * in the shared LocalStudentList: search, a page at a time, a header per group, a
 * status chip (or neutral "Not recorded"), and the whole row opens v1's
 * "Override attendance" sheet (owner, 2026-11-07: no Edit button per row).
 * The screen owns the write.
 * Native differences: no check-in time under the name (the roster carries no
 * `checkedInAt`, gap note); polling lives in the screen. This list also
 * serves the admin session page.
 */
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { Button } from "../../design/ui/button";
import { Sheet } from "../../design/ui/sheet";
import { StatusChip, statusChip } from "../../design/ui/status-chip";
import { Text } from "../../design/ui/text";
import { LocalStudentList } from "../students-list/local-student-list";

const ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT"];

export function CheckInAttendanceList({
  rows,
  pending,
  error,
  onOverride,
  onDismiss,
}: {
  rows: AttendanceRosterRow[];
  pending: boolean;
  /** The last override's failure, shown inside the sheet (the card is behind it). */
  error: string | null;
  /** Resolves when the write settles; the sheet closes on success. */
  onOverride: (row: AttendanceRosterRow, status: AttendanceStatus, done: () => void) => void;
  /** The sheet closed without a save (backdrop, drag, back): clear the last failure so the next student's sheet starts clean. */
  onDismiss?: () => void;
}) {
  const [editing, setEditing] = useState<AttendanceRosterRow | null>(null);
  // The last edited row, kept so the caption does not blank while the sheet animates out.
  const [shown, setShown] = useState<AttendanceRosterRow | null>(null);
  const nameOf = (r: AttendanceRosterRow) => r.name ?? r.email;

  if (rows.length === 0) {
    return (
      <Text variant="subhead" className="py-4 text-center text-muted-foreground">
        No students have scanned yet.
      </Text>
    );
  }

  return (
    <>
      <LocalStudentList
        items={rows.map((r) => ({
          id: r.studentUserId,
          name: nameOf(r),
          group: r.groupName,
          row: r,
        }))}
        trailing={({ row: r }) =>
          r.status !== null ? (
            <StatusChip {...statusChip("attendance", r.status)} />
          ) : (
            <StatusChip tone="neutral" label="Not recorded" />
          )
        }
        onPress={({ row: r }) => {
          setShown(r);
          setEditing(r);
        }}
      />

      <Sheet
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          onDismiss?.();
        }}
        title="Override attendance"
      >
        <View className="flex-col gap-3 pb-4">
          <Text variant="subhead" className="text-muted-foreground">
            {shown ? nameOf(shown) : ""}
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
