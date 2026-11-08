import { ConfirmDialog } from "../../design/ui";

/** The one confirm for deleting a post; it stays open while the delete runs. */
export function DeletePostSheet({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Delete this announcement?"
      description="It disappears for everyone it reached. This can't be undone."
      confirmLabel="Delete"
      destructive
      pending={pending}
      onConfirm={onConfirm}
    />
  );
}
