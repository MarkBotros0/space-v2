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
 * Background: every v1 role layout wraps its pages in `bg-brand-navy-50
 * dark:bg-transparent … pb-24` (app/<role>/layout.tsx); the tint ends 96px
 * below the content, so a short page shows the plain background under it.
 * `home` (the dashboard route only) puts the bell and the user menu at the
 * top of the content, ruling R13. `back` is Screen's pinned back bar
 * (ruling R16), for a pushed screen that has no back link of its own.
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
  back?: BackTarget;
}) {
  return (
    <Screen
      scroll={scroll}
      refreshing={refreshing}
      onRefresh={onRefresh}
      home={home}
      back={back}
      contentClassName="bg-brand-navy-50 dark:bg-background"
    >
      {children}
    </Screen>
  );
}
