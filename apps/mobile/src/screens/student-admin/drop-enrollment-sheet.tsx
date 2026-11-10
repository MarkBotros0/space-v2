import { useState } from "react";
import { View } from "react-native";
import type { EnrollmentHistoryItem } from "@space/shared";

import { useDropEnrollment } from "../../hooks/use-students";
import { apiErrorMessage } from "../../lib/api-error";
import { FormField } from "../../design/ui/form-field";
import { Sheet, SheetSaveBar } from "../../design/ui/sheet";
import { Text } from "../../design/ui/text";
import { Textarea } from "../../design/ui/textarea";

interface DropEnrollmentSheetProps {
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
    <Sheet
      open={enrollment !== null}
      onClose={() => {
        if (!drop.isPending) close();
      }}
      title={`Drop from ${enrollment?.seasonTitle ?? "this season"}?`}
      footer={
        <SheetSaveBar
          label="Drop student"
          variant="destructive"
          loading={drop.isPending}
          onPress={submit}
          hint={error ?? fieldError ?? undefined}
        />
      }
    >
      <View className="flex-col gap-4 pb-4">
        <Text variant="subhead" className="text-muted-foreground">
          The student leaves this season without graduating and appears on the dropped list. The record is kept.
        </Text>
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
      </View>
    </Sheet>
  );
}
