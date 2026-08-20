import { create } from "zustand";
import type { AuthUser } from "@space/shared";

interface SessionState {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
