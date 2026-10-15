/**
 * Port of v1 components/sessions/check-in-attendance-list.tsx: the session's
 * roster with a status badge (or "Not recorded") and an "Edit" button that
 * opens v1's "Override attendance" sheet. The screen owns the write.
 * Native differences: no check-in time under the name (the roster carries no
 * `checkedInAt`, gap note); polling lives in the screen.
 */
import type { AttendanceRosterRow, AttendanceStatus } from "@space/shared";
import { useState } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Modal, ModalContent, ModalDescription, ModalHeader, ModalTitle } from "../ui/modal";
import { Text } from "../ui/text";

const STATUS: Record<AttendanceStatus, { label: string; variant: "success" | "warning" | "error" }> = {
  PRESENT: { label: "Present", variant: "success" },
  LATE: { label: "Late", variant: "warning" },
  ABSENT: { label: "Absent", variant: "error" },
};
const ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT"];

export function CheckInAttendanceList({
  rows,
  pending,
  onOverride,
}: {
  rows: AttendanceRosterRow[];
  pending: boolean;
  /** Resolves when the write settles; the sheet closes on success. */
  onOverride: (row: AttendanceRosterRow, status: AttendanceStatus, done: () => void) => void;
}) {
  const [editing, setEditing] = useState<AttendanceRosterRow | null>(null);
  const nameOf = (r: AttendanceRosterRow) => r.name ?? r.email;

  if (rows.length === 0) {
    return <Text className="py-4 text-center text-sm italic text-muted-foreground">No students have scanned yet.</Text>;
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
              <Text className="text-sm font-medium text-foreground">{nameOf(r)}</Text>
            </View>
            <View className="shrink-0 flex-row items-center gap-2">
              {r.status !== null ? (
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
              ) : (
                <Badge variant="outline">Not recorded</Badge>
              )}
              <Button
                variant="outline"
                size="xs"
                accessibilityLabel={`Edit attendance for ${nameOf(r)}`}
                onPress={() => setEditing(r)}
              >
                Edit
              </Button>
            </View>
          </View>
        ))}
      </View>

      <Modal open={editing !== null} onOpenChange={(open) => (open ? null : setEditing(null))}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Override attendance</ModalTitle>
            <ModalDescription>{editing ? nameOf(editing) : ""}</ModalDescription>
          </ModalHeader>
          {/* v1 grid grid-cols-2 gap-2: Absent sits alone on the second row. */}
          <View className="w-full flex-col gap-2">
            {[ORDER.slice(0, 2), ORDER.slice(2)].map((pair, i) => (
              <View key={i} className="flex-row gap-2">
                {pair.map((status) => (
                  <View key={status} className="flex-1">
                    <Button
                      variant="outline"
                      disabled={pending}
                      accessibilityLabel={editing ? `Mark ${nameOf(editing)} ${status}` : status}
                      onPress={() => {
                        if (editing) onOverride(editing, status, () => setEditing(null));
                      }}
                    >
                      {STATUS[status].label}
                    </Button>
                  </View>
                ))}
                {pair.length === 1 ? <View className="flex-1" /> : null}
              </View>
            ))}
          </View>
        </ModalContent>
      </Modal>
    </>
  );
}
