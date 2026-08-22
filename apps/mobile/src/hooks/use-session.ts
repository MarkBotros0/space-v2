import { useEffect } from "react";
import { meResponseSchema } from "@space/shared";

import { apiClient, login as loginRequest } from "../lib/api-client";
import { clearSession, loadAccessToken } from "../lib/token-storage";
import { useSessionStore } from "../store/session";

/**
 * Boot gate: decides, once per app launch, whether there is a session worth
 * restoring before anything else renders. `app/_layout.tsx` must hold the
 * `Stack` behind `status === "idle" || status === "restoring"` — otherwise a
 * signed-in user briefly sees `app/index.tsx` redirect them to `/login`
 * before this resolves.
 */
export function useBootSession(): void {
  const setStatus = useSessionStore((s) => s.setStatus);
  const setSession = useSessionStore((s) => s.setSession);
  const clear = useSessionStore((s) => s.clear);

  useEffect(() => {
    // Read status imperatively rather than via a selector: `setStatus` below
    // flips it to "restoring", which would otherwise be a reactive dependency
    // that reruns this very effect mid-flight. React tears down the in-flight
    // effect first (setting `cancelled` before the boot fetch resolves), so
    // a selector-driven guard aborts the boot it just started.
    if (useSessionStore.getState().status !== "idle") return;

    let cancelled = false;

    async function boot() {
      setStatus("restoring");

      const token = await loadAccessToken();
      if (!token) {
        if (!cancelled) clear();
        return;
      }

      try {
        const res = await apiClient.get("/api/v1/me");
        const me = meResponseSchema.parse(res.data.data);
        if (cancelled) return;

        if (!me.user) {
          // The row was deleted inside the access token's window: the token
          // still verifies, but there is no one to sign in as.
          await clearSession();
          clear();
          return;
        }

        setSession(me.user, me.scopes);
      } catch {
        if (cancelled) return;
        await clearSession();
        clear();
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [setStatus, setSession, clear]);
}

/**
 * `login()` (api-client) only returns an `AuthUser` — no `avatarPath`, no
 * scopes at all (those exist solely on `/me`). It already calls
 * `saveSession()` internally, so this does not store tokens a second time;
 * it only follows up with `/me` to populate the store the way `useBootSession`
 * does.
 */
export function useLogin(): (email: string, password: string) => Promise<void> {
  const setSession = useSessionStore((s) => s.setSession);
  const clear = useSessionStore((s) => s.clear);

  return async (email: string, password: string) => {
    await loginRequest(email, password);

    try {
      const res = await apiClient.get("/api/v1/me");
      const me = meResponseSchema.parse(res.data.data);
      if (!me.user) throw new Error("me returned no user after login");

      setSession(me.user, me.scopes);
    } catch (err) {
      // A half-finished login (tokens saved, session unpopulated) is worse
      // than no login at all — don't leave stored tokens behind.
      await clearSession();
      clear();
      throw err;
    }
  };
}

export function useLogout(): () => Promise<void> {
  const clear = useSessionStore((s) => s.clear);

  return async () => {
    await clearSession();
    clear();
  };
}
