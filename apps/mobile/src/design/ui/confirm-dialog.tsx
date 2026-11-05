/**
 * Confirm dialog: v1's props and copy on the redesign Modal, with the
 * redesign Button variants (secondary cancel; primary or destructive confirm,
 * stacked confirm-first, full width).
 */
import type { ReactNode } from "react";

import { Button } from "./button";
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "./modal";

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          {description ? <ModalDescription>{description}</ModalDescription> : null}
        </ModalHeader>
        <ModalFooter>
          <Button variant="secondary" onPress={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onPress={() => void onConfirm()} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export { ConfirmDialog };
