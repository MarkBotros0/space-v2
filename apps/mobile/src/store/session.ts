import { create } from "zustand";
import { navFor, type MeScopes, type MeUser, type RoleNav } from "@space/shared";

/**
 * `idle` means the app has not yet looked for a stored session; `anonymous`
 * means it looked and there was none. The boot gate needs to tell those apart
 * — treating idle as anonymous flashes the login screen at a signed-in user
 * on every cold start.
 */
export type BootStatus = "idle" | "restoring" | "authenticated" | "anonymous";

interface SessionState {
  status: BootStatus;
  user: MeUser | null;
  scopes: MeScopes | null;
  setStatus: (status: BootStatus) => void;
  setSession: (user: MeUser, scopes: MeScopes) => void;
  clear: () => void;
  nav: () => RoleNav | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: "idle",
  user: null,
  scopes: null,
  setStatus: (status) => set({ status }),
  setSession: (user, scopes) => set({ user, scopes, status: "authenticated" }),
  clear: () => set({ user: null, scopes: null, status: "anonymous" }),
  nav: () => {
    const { user, scopes } = get();
    if (!user || !scopes) return null;
    return navFor({ role: user.role, graduationYear: scopes.graduationYear });
  },
}));
