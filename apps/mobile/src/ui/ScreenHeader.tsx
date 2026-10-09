import { createContext, useContext, type ReactNode } from "react";

/**
 * The app shell's header content, rendered at the top of every `Screen`.
 *
 * v1's app shell puts the notification bell on every page for every role
 * (jpc-space src/components/layout/app-shell.tsx:55-57; 10-notifications
 * R36). `(app)/_layout.tsx` provides the bell here, so every screen under the
 * authenticated tab shell shows it; screens outside it (login, reset, invite)
 * have no provider and render no header. Carried as a node through context —
 * rather than `Screen` importing the bell — so `ui/` never depends on
 * `components/`.
 */
export const ScreenHeaderContext = createContext<ReactNode>(null);

export function useScreenHeader(): ReactNode {
  return useContext(ScreenHeaderContext);
}
