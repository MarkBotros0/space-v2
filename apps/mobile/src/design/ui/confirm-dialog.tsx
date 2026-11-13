/**
 * Confirm dialog: v1's props and copy on the redesign Modal, with the
 * redesign Button variants (secondary cancel; primary or destructive confirm,
 * stacked confirm-first, full width). The centred layout below cancels with a
 * plain button, so the one filled button is the action.
 *
 * `icon` turns it into the centred account-action layout (Sign out, Delete
 * account): the icon in a round tint, a centred title and line, and `points`,
 * the consequences one per line in a quiet box. `destructive="solid"` draws
 * the confirm as the solid danger button, kept for a step that can't be undone
 * from the app; plain `destructive` stays the soft red button.
 */
import type { ReactNode } from "react";
import { View } from "react-native";

import { cn } from "../lib/cn";
import { Button } from "./button";
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from "./modal";
import { Text } from "./text";

function Points({ points }: { points: string[] }) {
  return (
    <View className="flex-col gap-3 rounded-card bg-background p-4">
      {points.map((point) => (
        <View key={point} className="flex-row items-start gap-3">
          <View className="mt-2 size-1.5 rounded-full bg-muted-foreground" />
          <Text variant="subhead" className="flex-1">
            {point}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  icon,
  points,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean | "solid";
  /** A 28pt icon, coloured by the caller; centres the header. */
  icon?: ReactNode;
  points?: string[];
  onConfirm: () => void | Promise<void>;
  pending?: boolean;
}) {
  const confirmVariant = destructive === "solid" ? "danger" : destructive ? "destructive" : "primary";
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        {icon ? (
          <View className="items-center pt-2">
            <View
              className={cn(
                "size-16 items-center justify-center rounded-full",
                destructive ? "bg-bad-soft" : "bg-muted",
              )}
            >
              {icon}
            </View>
          </View>
        ) : null}
        <ModalHeader className={icon ? "items-center px-6" : undefined}>
          <ModalTitle className={icon ? "text-center" : undefined}>{title}</ModalTitle>
          {description ? (
            <ModalDescription className={icon ? "text-center" : undefined}>{description}</ModalDescription>
          ) : null}
        </ModalHeader>
        {points && points.length > 0 ? <Points points={points} /> : null}
        <ModalFooter>
          <Button variant={icon ? "plain" : "secondary"} onPress={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onPress={() => void onConfirm()} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export { ConfirmDialog };
