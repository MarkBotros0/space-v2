/**
 * Bring back: a SUPER restores a dropped seat. The first dialog asks; when the
 * server refuses with `not_eligible` (a program block) a second shows its reason
 * and offers Add anyway, which re-posts with `override`. Every other refusal is
 * the server's reason in a toast.
 */
import { useEffect, useState } from "react";
import type { EnrollmentHistoryItem } from "@space/shared";

import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import { toast } from "../../design/ui/toaster";
import { useRestoreEnrollment } from "../../hooks/use-students";
import { apiErrorCode, apiErrorMessage } from "../../lib/api-error";
import { haptic } from "../../design/motion";

export function BringBackDialogs({
  studentId,
  studentName,
  enrollment,
  onClose,
}: {
  studentId: number;
  studentName: string;
  enrollment: EnrollmentHistoryItem | null;
  onClose: () => void;
}) {
  const restore = useRestoreEnrollment();
  const [blocked, setBlocked] = useState<string | null>(null);
  useEffect(() => {
    if (enrollment === null) setBlocked(null);
  }, [enrollment]);

  const run = (override: boolean) => {
    if (!enrollment || restore.isPending) return;
    restore.mutate(
      { studentId, seasonId: enrollment.seasonId, override },
      {
        onSuccess: () => {
          haptic("success");
          onClose();
        },
        onError: (err) => {
          if (!override && apiErrorCode(err) === "not_eligible") {
            setBlocked(apiErrorMessage(err, "They don't meet this season's program requirement."));
            return;
          }
          toast.error(apiErrorMessage(err, "Couldn't bring them back."));
          onClose();
        },
      },
    );
  };

  // One dialog that changes its words: a second Modal opening as the first dismisses can be dropped on iOS.
  const notEligible = blocked !== null;
  return (
    <ConfirmDialog
      open={enrollment !== null}
      onOpenChange={(open) => {
        if (!open && !restore.isPending) onClose();
      }}
      title={
        notEligible
          ? "Not eligible"
          : enrollment
            ? `Bring ${studentName} back into ${enrollment.seasonTitle}?`
            : "Bring back?"
      }
      description={blocked ?? undefined}
      confirmLabel={notEligible ? "Add anyway" : "Bring back"}
      pending={restore.isPending}
      onConfirm={() => run(notEligible)}
    />
  );
}
