import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useState, type ReactNode } from "react";

import { iconWithClassName } from "../../design/lib/icon";
import { toast } from "../../design/ui";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";
import { useDeleteAccount } from "../../hooks/use-account";
import { apiErrorCode, apiErrorMessage } from "../../lib/api-error";
import { clearSession } from "../../lib/token-storage";
import { useSessionStore } from "../../store/session";

iconWithClassName(Trash2);

/** What deleting does, one fact per line (owner 2026-11-13: the old paragraph read oddly). */
const DELETE_POINTS = [
  "You're signed out on every device.",
  "You can't sign in again with this account.",
  "Your past submissions and attendance stay on record for your leaders.",
  "To come back, ask the JPC team.",
];

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
        description="This can't be undone from the app."
        icon={<Trash2 size={28} className="text-bad" />}
        points={DELETE_POINTS}
        confirmLabel="Delete account"
        destructive="solid"
        pending={deleteAccount.isPending}
        onConfirm={confirm}
      />
    ),
  };
}
