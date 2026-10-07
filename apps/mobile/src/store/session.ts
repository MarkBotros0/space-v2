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
    return navFor({ role: user.role, graduationYear: scopes.graduationYear });
  },
}));
