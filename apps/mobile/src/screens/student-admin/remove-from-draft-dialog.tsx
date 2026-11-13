import type { EnrollmentHistoryItem } from "@space/shared";

import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import { toast } from "../../design/ui/toaster";
import { useRemoveSeasonPerson } from "../../hooks/use-season-people";
import { apiErrorMessage } from "../../lib/api-error";
import { haptic } from "../../design/motion";

/**
 * Remove, on a student's row in a draft: the roster's own action and words. A
 * draft's row is a plan, so it goes rather than being dropped. A refusal (they
 * already have work) is the server's reason in a toast.
 */
export function RemoveFromDraftDialog({
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
  const remove = useRemoveSeasonPerson(enrollment?.seasonId ?? null);
  return (
    <ConfirmDialog
      open={enrollment !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Remove from season?"
      description={
        enrollment
          ? `${studentName} will come off ${enrollment.seasonTitle}. You can add them again until it starts.`
          : undefined
      }
      confirmLabel="Remove"
      destructive
      pending={remove.isPending}
      onConfirm={() => {
        if (!enrollment || remove.isPending) return;
        remove.mutate(
          { userId: studentId },
          {
            onSuccess: () => {
              haptic("success");
              onClose();
            },
            onError: (err) => {
              toast.error(apiErrorMessage(err, "Couldn't remove them."));
              onClose();
            },
          },
        );
      }}
    />
  );
}
