import { useState } from "react";
import type { EnrollmentHistoryItem } from "@space/shared";

import { useDropEnrollment } from "../hooks/use-students";
import { apiErrorMessage } from "../lib/api-error";
import { FormErrorBox } from "../design/forms/form-parts";
import { Button } from "../design/ui/button";
import { FormField } from "../design/ui/form-field";
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "../design/ui/modal";
import { Textarea } from "../design/ui/textarea";

export interface DropEnrollmentSheetProps {
  studentId: number;
  /** The row being dropped; null hides the sheet. */
  enrollment: EnrollmentHistoryItem | null;
  onClose: () => void;
}

/** v1's drop-enrollment-button.tsx modal (a bottom sheet at phone width). Reason optional, ≤500, "" stored null (R66). */
export function DropEnrollmentSheet({ studentId, enrollment, onClose }: DropEnrollmentSheetProps) {
  const drop = useDropEnrollment();
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason("");
    setFieldError(null);
    setError(null);
    onClose();
  };

  const submit = () => {
    if (!enrollment) return;
    setFieldError(null);
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length > 500) {
      setFieldError("At most 500 characters.");
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
    <Modal
      open={enrollment !== null}
      onOpenChange={(open) => {
        if (!open && !drop.isPending) close();
      }}
    >
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{`Drop from ${enrollment?.seasonTitle ?? "this season"}?`}</ModalTitle>
          <ModalDescription>
            The student leaves this season without graduating and appears on the dropped list. The record is kept.
          </ModalDescription>
        </ModalHeader>
        <FormField
          label="Reason"
          description="Optional — visible in the dropped-students list."
          error={fieldError ?? undefined}
        >
          <Textarea
            accessibilityLabel="Reason"
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Moved cities, stopped attending, personal reasons…"
          />
        </FormField>
        <FormErrorBox message={error} />
        <ModalFooter>
          <Button variant="outline" onPress={close} disabled={drop.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onPress={submit} disabled={drop.isPending}>
            {drop.isPending ? "Dropping…" : "Drop student"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
