import { useCallback, useEffect } from "react";
import axios from "axios";
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
    // that reruns this very effect mid-flight (StrictMode's double effect, or
    // a parent re-render, would then fire a second `/me` call).
    //
    // There used to be a `cancelled` flag here too, set on effect teardown to
    // stop the in-flight boot from writing after "unmount". It protected
    // nothing: every write below lands on the Zustand store, not React
    // component state, so there is no setState-after-unmount hazard to guard
    // against. What it actually did was deadlock boot at "restoring" forever
    // on any mid-flight teardown (StrictMode's mount→cleanup→mount reproduces
    // it exactly: cleanup flips `cancelled` before the in-flight `/me` call
    // resolves, so the resolution becomes a no-op and the gate never leaves
    // `restoring`). A boot that outlives the component that started it just
    // finishes writing to the store normally — that's fine.
    if (useSessionStore.getState().status !== "idle") return;

    async function boot() {
      setStatus("restoring");

      const token = await loadAccessToken();
      if (!token) {
        clear();
        return;
      }

      try {
        const res = await apiClient.get("/api/v1/me");
        const me = meResponseSchema.parse(res.data.data);

        if (!me.user) {
          // The row was deleted inside the access token's window: the token
          // still verifies, but there is no one to sign in as.
          await clearSession();
          clear();
          return;
        }

        setSession(me.user, me.scopes);
      } catch (err) {
        // Mirror api-client's ROTATE_INDETERMINATE distinction: only a
        // definitive rejection from the server (a 4xx response) proves the
        // stored access token is actually bad. A network error, timeout,
        // 5xx, or a malformed /me response is indeterminate — go to
        // "anonymous" so the app is usable, but leave the stored tokens
        // alone so the next launch (once connectivity returns) can retry
        // instead of forcing a full re-login.
        if (
          axios.isAxiosError(err) &&
          err.response &&
          err.response.status >= 400 &&
          err.response.status < 500
        ) {
          await clearSession();
        }
        clear();
      }
    }

    void boot();
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

  return useCallback(
    async (email: string, password: string) => {
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
    },
    [setSession, clear],
  );
}

export function useLogout(): () => Promise<void> {
  const clear = useSessionStore((s) => s.clear);

  return useCallback(async () => {
    await clearSession();
    clear();
  }, [clear]);
}
