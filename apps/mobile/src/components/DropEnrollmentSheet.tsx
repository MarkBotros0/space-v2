import { useState } from "react";
import type { EnrollmentHistoryItem } from "@space/shared";

import { useDropEnrollment } from "../hooks/use-students";
import { apiErrorMessage } from "../lib/api-error";
import { Button, Input, Sheet, Text } from "../ui";

export interface DropEnrollmentSheetProps {
  studentId: number;
  /** The row being dropped; null hides the sheet. */
  enrollment: EnrollmentHistoryItem | null;
  onClose: () => void;
}

/** v1's drop-enrollment-button.tsx modal as a sheet. Reason optional, ≤500, "" stored null (R66). */
export function DropEnrollmentSheet({ studentId, enrollment, onClose }: DropEnrollmentSheetProps) {
  const drop = useDropEnrollment();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!enrollment) return;
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length > 500) {
      setError("At most 500 characters.");
      return;
    }
    drop.mutate(
      { studentId, seasonId: enrollment.seasonId, dropReason: trimmed === "" ? null : trimmed },
      {
        onSuccess: close,
        onError: (err) => setError(apiErrorMessage(err, "Couldn't drop this enrollment.")),
      },
    );
  };

  return (
    <Sheet
      visible={enrollment !== null}
      title={`Drop from ${enrollment?.seasonTitle ?? "this season"}?`}
      onClose={close}
    >
      <Text variant="body">
        The student leaves this season without graduating and appears on the dropped list. The record is kept.
      </Text>
      <Input
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        multiline
        placeholder="e.g. Moved cities, stopped attending"
        error={error ?? undefined}
      />
      <Button title="Drop student" onPress={submit} loading={drop.isPending} />
      <Button title="Cancel" variant="ghost" onPress={close} />
    </Sheet>
  );
}
