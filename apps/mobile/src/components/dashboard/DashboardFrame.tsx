import type { ReactNode } from "react";

import { Screen } from "../../ui";

/**
 * Every branch's outer frame: a tab screen (the tab bar owns the bottom inset).
 * The notification bell is no longer here — `Screen` renders it on every
 * screen from the shell header (10-notifications R36). Each branch owns its
 * queries and therefore its own pull-to-refresh.
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
      {children}
    </Screen>
  );
}
