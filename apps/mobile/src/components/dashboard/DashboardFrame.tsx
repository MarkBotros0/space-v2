import type { ReactNode } from "react";

import { Screen } from "../../ui";
import { NotificationBell } from "../NotificationBell";

/**
 * Every branch's outer frame: a tab screen (the tab bar owns the bottom inset)
 * with Plan 13's bell first — the dashboard is the one href in all six navs,
 * which is why the bell lives here (spec 10 D3). Each branch owns its queries
 * and therefore its own pull-to-refresh.
 */
export function DashboardFrame({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <Screen edges={["top", "left", "right"]} onRefresh={onRefresh} refreshing={refreshing}>
      <NotificationBell />
      {children}
    </Screen>
  );
}
