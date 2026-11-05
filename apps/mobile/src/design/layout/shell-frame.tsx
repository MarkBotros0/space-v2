import type { ReactNode } from "react";

import type { BackTarget } from "./large-title";
import { Screen } from "./screen";

/**
 * The frame of every screen not yet moved to `Screen` (plan 01 Task 10; to be
 * deleted in plan 05). It is `Screen` without a title: the top inset and the
 * offline strip, the bottom padding that clears the pill (or the inset on a
 * detail screen), the keyboard inset, pull-to-refresh, and the scroll
 * direction the pill follows. The screen keeps its own `PageTitle` in the
 * content until its batch.
 * Background: the Screen's `bg-background`, like every redesigned screen.
 * v1's navy-50 page tint is gone (R32): it covered only the
 * content, so a short page showed a two-tone seam where it ended. Cards stay
 * apart from the page as `bg-card`/`bg-surface`.
 * `home` (the dashboard route only) puts the bell and the user menu at the
 * top of the content, ruling R13. `back` is Screen's pinned back bar
 * (ruling R16); left unset it is `BACK_TO_PREVIOUS` on the stack (R23), `null` opts out.
 */
export function ShellFrame({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
  home = false,
  back,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  home?: boolean;
  back?: BackTarget | null;
}) {
  return (
    <Screen scroll={scroll} refreshing={refreshing} onRefresh={onRefresh} home={home} back={back}>
      {children}
    </Screen>
  );
}
