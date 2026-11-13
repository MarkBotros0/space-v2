import { LogOut } from "lucide-react-native";
import { useState, type ReactNode } from "react";

import { iconWithClassName } from "../../design/lib/icon";
import { ConfirmDialog } from "../../design/ui/confirm-dialog";

iconWithClassName(LogOut);

/**
 * "Sign out" behind a confirmation (owner 2026-11-13), so a stray tap on More
 * doesn't sign someone out. Returns the opener for the row and the dialog to
 * render once next to it. The boot-retry screen's Sign out stays direct: it is
 * the way out when the app can't start.
 */
export function useSignOutFlow(signOut: () => Promise<void>): { request: () => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await signOut();
    } finally {
      setPending(false);
      setOpen(false);
    }
  };

  return {
    request: () => {
      if (!pending) setOpen(true);
    },
    dialog: (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Sign out?"
        description="You'll need to sign in again to use JPC Space on this phone."
        icon={<LogOut size={28} className="text-bad" />}
        confirmLabel="Sign out"
        destructive="solid"
        pending={pending}
        onConfirm={confirm}
      />
    ),
  };
}
