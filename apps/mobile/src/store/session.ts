import { create } from "zustand";
import {
  isAlumnusNotStudying,
  navFor,
  type MeScopes,
  type MeUser,
  type NavAudience,
  type RoleNav,
  type UserRole,
} from "@space/shared";

import { isAdminOfSeasonForUi } from "../lib/season-admin";

/**
 * `idle` means the app has not yet looked for a stored session; `anonymous`
 * means it looked and there was none. The boot gate needs to tell those apart
 * — treating idle as anonymous flashes the login screen at a signed-in user
 * on every cold start. `retry` means there is a stored session that the server
 * couldn't confirm or refuse (rate limited, say): keep it and offer to try again.
 */
type BootStatus = "idle" | "restoring" | "authenticated" | "anonymous" | "retry";

interface SessionState {
  status: BootStatus;
  user: MeUser | null;
  scopes: MeScopes | null;
  /**
   * This device's Expo push token, once the user has enabled push. Held here
   * so a screen can tell whether push is on without re-reading SecureStore,
   * and cleared on sign-out because the token identifies a (user, device)
   * pair, not a device.
   */
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
  setStatus: (status: BootStatus) => void;
  setSession: (user: MeUser, scopes: MeScopes) => void;
  clear: () => void;
  nav: () => RoleNav | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "idle",
  user: null,
  scopes: null,
  pushToken: null,
  setPushToken: (pushToken) => set({ pushToken }),
  setStatus: (status) => set({ status }),
  setSession: (user, scopes) => set({ user, scopes, status: "authenticated" }),
  clear: () => set({ user: null, scopes: null, pushToken: null, status: "anonymous" }),
  nav: () => {
    const { user, scopes } = get();
    if (!user || !scopes) return null;
    return navFor({ role: user.role, graduationYear: scopes.graduationYear, activeSeasonId: scopes.activeSeasonId });
  },
}));

/** The signed-in person as the shared audience rules read them; null when signed out. */
export function audienceOf(state: Pick<SessionState, "user" | "scopes">): NavAudience | null {
  if (state.user == null) return null;
  return {
    role: state.user.role,
    graduationYear: state.scopes?.graduationYear ?? null,
    activeSeasonId: state.scopes?.activeSeasonId ?? null,
  };
}

/** navFor's rule (shared): a graduated student, unless studying. False when signed out. */
export function useAlumnusNotStudying(): boolean {
  return useSessionStore((s) => {
    const audience = audienceOf(s);
    return audience !== null && isAlumnusNotStudying(audience);
  });
}

/** The signed-in person's role, or null when signed out. */
export function useRole(): UserRole | null {
  return useSessionStore((s) => s.user?.role ?? null);
}

export function useIsSuper(): boolean {
  return useSessionStore((s) => s.user?.role === "SUPER");
}

export function useIsAdminOfSeason(seasonId: number): boolean {
  return useSessionStore((s) => isAdminOfSeasonForUi(s.user, s.scopes, seasonId));
}
