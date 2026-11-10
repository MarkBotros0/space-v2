import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";

import { toast } from "../../design/ui";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import { useDeleteAccount } from "../../hooks/use-account";
import { apiErrorCode, apiErrorMessage } from "../../lib/api-error";
import { clearSession } from "../../lib/token-storage";
import { useSessionStore } from "../../store/session";

/**
 * "Delete account" behind a confirmation (owner, 2026-11-06: it lives on More,
 * for every role). Returns the opener for a
 * row and the dialog to render once next to it.
 */
export function useDeleteAccountFlow(): { request: () => void; dialog: ReactNode } {
  const router = useRouter();
  const clear = useSessionStore((s) => s.clear);
  const deleteAccount = useDeleteAccount();
  const [open, setOpen] = useState(false);

  const confirm = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: async () => {
        setOpen(false);
        // The server already revoked every session and push device; only the
        // local copy is left to clear.
        await clearSession();
        clear();
        router.replace("/login");
        toast.success("Your account was deleted.");
      },
      onError: (err) => {
        setOpen(false);
        if (apiErrorCode(err) === "last_super") {
          toast.error(apiErrorMessage(err, "You're the only active SUPER account, so it can't be deleted."));
        } else {
          toast.error("Couldn't delete your account. Try again.");
        }
      },
    });
  };

  return {
    request: () => {
      if (!deleteAccount.isPending) setOpen(true);
    },
    dialog: (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="You'll be signed out on every device and won't be able to sign in again. Your past submissions and attendance stay on record for your leaders. To come back, ask the JPC team."
        confirmLabel="Delete account"
        destructive
        pending={deleteAccount.isPending}
        onConfirm={confirm}
      />
    ),
  };
}
