import { useCallback, useEffect } from "react";
import axios from "axios";
import { meResponseSchema } from "@space/shared";

import {
  apiClient,
  forgetDevice,
  login as loginRequest,
  loginWithGoogle,
  logout as logoutRequest,
} from "../lib/api-client";
import { googleIdToken } from "../lib/google-sign-in";
import { isRefreshIndeterminate } from "../lib/api-error";
import { clearSession, loadAccessToken } from "../lib/token-storage";
import { useSessionStore } from "../store/session";
import { syncPushRegistration, unregisterPushToken } from "../lib/push";

/**
 * Did this failure prove the stored session is dead? A 4xx from /me does, with
 * two exceptions: a 429 is a rate limit, and a 401 whose refresh neither worked
 * nor was refused (tagged by api-client) says nothing about the refresh token.
 */
function isUnconfirmed(err: unknown): boolean {
  return isRefreshIndeterminate(err) || (axios.isAxiosError(err) && err.response?.status === 429);
}

/** One look for a stored session. `BootRetry` runs it again; see `useBootSession`. */
export async function bootSession(): Promise<void> {
  const { setStatus, setSession, clear } = useSessionStore.getState();
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
      await forgetDevice();
      await clearSession();
      clear();
      return;
    }

    setSession(me.user, me.scopes);
    void syncPushRegistration();
  } catch (err) {
    if (isUnconfirmed(err)) {
      // The server is there and couldn't say. Sign-in would be a false answer
      // to a rate limit, so stay on a retry and keep every stored token.
      setStatus("retry");
      return;
    }
    // Mirror api-client's ROTATE_INDETERMINATE distinction: only a
    // definitive rejection from the server (a 4xx response) proves the
    // stored access token is actually bad. A network error, timeout,
    // 5xx, or a malformed /me response is indeterminate — go to
    // "anonymous" so the app is usable, but leave the stored tokens
    // alone so the next launch (once connectivity returns) can retry
    // instead of forcing a full re-login.
    if (axios.isAxiosError(err) && err.response && err.response.status >= 400 && err.response.status < 500) {
      await forgetDevice();
      await clearSession();
    }
    clear();
  }
}

/** Longest the way out of `BootRetry` waits on anything (forgetDevice's own timeout is 5s). */
const SIGN_OUT_STEP_CAP_MS = 6000;

async function capped(step: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SIGN_OUT_STEP_CAP_MS);
  });
  await Promise.race([step.catch(() => undefined), giveUp]);
  clearTimeout(timer);
}

/**
 * Sign out when the server can't be reached or can't answer: the way out of
 * `BootRetry`. Not `useLogout`: that goes through `apiClient`, whose 401 would
 * start the failing refresh again, and its revoke call has no timeout. Always
 * ends on "anonymous", whatever the network or the keychain does. The refresh
 * token isn't revoked on the server; it expires on its own, as on a forced sign-out.
 */
export async function signOutOfBoot(): Promise<void> {
  await capped(forgetDevice());
  await capped(clearSession());
  useSessionStore.getState().clear();
}

/**
 * Boot gate: decides, once per app launch, whether there is a session worth
 * restoring before anything else renders. `app/_layout.tsx` must hold the
 * `Stack` behind `status === "idle" || status === "restoring"` — otherwise a
 * signed-in user briefly sees `app/index.tsx` redirect them to `/login`
 * before this resolves.
 */
export function useBootSession(): void {
  useEffect(() => {
    // Read status imperatively rather than via a selector: `bootSession` flips
    // it to "restoring", which would otherwise be a reactive dependency that
    // reruns this very effect mid-flight (StrictMode's double effect, or a
    // parent re-render, would then fire a second `/me` call).
    //
    // There used to be a `cancelled` flag here too, set on effect teardown to
    // stop the in-flight boot from writing after "unmount". It protected
    // nothing: every write lands on the Zustand store, not React component
    // state, so there is no setState-after-unmount hazard to guard against.
    // What it actually did was deadlock boot at "restoring" forever on any
    // mid-flight teardown. A boot that outlives the component that started it
    // just finishes writing to the store normally — that's fine.
    if (useSessionStore.getState().status !== "idle") return;
    void bootSession();
  }, []);
}

/**
 * `login()` (api-client) only returns an `AuthUser` — no `avatarPath`, no
 * scopes at all (those exist solely on `/me`). It already calls
 * `saveSession()` internally, so this does not store tokens a second time;
 * it only follows up with `/me` to populate the store the way `useBootSession`
 * does.
 */
export function useLogin(): (email: string, password: string) => Promise<void> {
  const finish = useFinishSignIn();
  return useCallback(
    async (email: string, password: string) => {
      await loginRequest(email, password);
      await finish();
    },
    [finish],
  );
}

/**
 * Google sign-in: the same follow-up as `useLogin`, after the backend swaps
 * Google's ID token for our own session. Resolves false when the person
 * closed Google's sheet, so the screen can stay quiet.
 */
export function useGoogleLogin(): () => Promise<boolean> {
  const finish = useFinishSignIn();
  return useCallback(async () => {
    const idToken = await googleIdToken();
    if (!idToken) return false;
    await loginWithGoogle(idToken);
    await finish();
    return true;
  }, [finish]);
}

/** After tokens are stored: `/me` fills the session store, as boot does. */
function useFinishSignIn(): () => Promise<void> {
  const setSession = useSessionStore((s) => s.setSession);
  const clear = useSessionStore((s) => s.clear);

  return useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/me");
      const me = meResponseSchema.parse(res.data.data);
      if (!me.user) throw new Error("me returned no user after login");

      setSession(me.user, me.scopes);
      void syncPushRegistration();
    } catch (err) {
      // A half-finished login (tokens saved, session unpopulated) is worse
      // than no login at all — don't leave stored tokens behind.
      await clearSession();
      clear();
      throw err;
    }
  }, [setSession, clear]);
}

export function useLogout(): () => Promise<void> {
  const clear = useSessionStore((s) => s.clear);

  return useCallback(async () => {
    // Best-effort: tell the server to revoke the refresh token so it can't
    // outlive sign-out for its full 30-day TTL. `logoutRequest` itself
    // skips the call when there is no stored refresh token. If the call
    // fails — offline, timeout, a 429 from the refresh limiter — the user
    // must never end up still "signed in" locally just because the network
    // was down, so the local clear below is unconditional. The failure is
    // not swallowed silently: it's caught here, at the one call site that
    // can observe it, rather than inside `logout()` itself.
    // While the access token still works: stop pushes to this phone.
    await unregisterPushToken();
    try {
      await logoutRequest();
    } catch {
      // Server-side revocation didn't happen this time; the refresh token
      // stays valid until it naturally expires. Local sign-out still
      // proceeds unconditionally below.
    }

    await clearSession();
    clear();
  }, [clear]);
}
