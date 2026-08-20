import axios from "axios";
import Constants from "expo-constants";
import { loginResponseSchema, sessionSchema, type LoginResponse, type Session } from "@space/shared";

import { clearSession, loadAccessToken, loadRefreshToken, saveSession } from "./token-storage";

const baseURL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:4000";

export const apiClient = axios.create({ baseURL, timeout: 15000 });

// Paths whose own 401s must never trigger a refresh rotation (see below).
// Checked with `endsWith` so this matches whether the request's `url` came
// through relative to `baseURL` (the normal case) or as an absolute URL.
const AUTH_ENDPOINT_PATHS = ["/api/v1/auth/login", "/api/v1/auth/refresh"];

function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_ENDPOINT_PATHS.some((path) => url === path || url.endsWith(path));
}

/**
 * Sentinel returned by a `RotateFn` to mean "the rotation attempt did not
 * get a definitive answer from the server" (network error, timeout, 5xx, or
 * a response that didn't match the expected shape) — as opposed to `null`,
 * which means the server explicitly rejected the refresh token. Only the
 * latter should cost the user their stored session.
 */
export const ROTATE_INDETERMINATE = Symbol("rotate-indeterminate");

export type RotateFn = (
  refreshToken: string,
) => Promise<Session | null | typeof ROTATE_INDETERMINATE>;

let inFlight: Promise<string | null> | null = null;

/** Test seam — clears the shared in-flight refresh promise between cases. */
export function __resetRefreshState(): void {
  inFlight = null;
}

async function rotateViaApi(
  refreshToken: string,
): Promise<Session | null | typeof ROTATE_INDETERMINATE> {
  try {
    const res = await axios.post(`${baseURL}/api/v1/auth/refresh`, { refreshToken });
    // Enforce the shared contract at the client boundary — if the backend's
    // response shape ever drifts, fail loudly here instead of handing a
    // malformed object to callers. A parse failure isn't proof the refresh
    // token was revoked, so it's treated the same as a transport failure
    // below (caught, not thrown further).
    return sessionSchema.parse(res.data.data);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && err.response.status >= 400 && err.response.status < 500) {
      // The server actually answered and rejected the token: it's revoked.
      return null;
    }
    // Network error, timeout, 5xx, or a schema parse failure — we don't know
    // whether the token is still good, so don't treat this as revocation.
    return ROTATE_INDETERMINATE;
  }
}

/**
 * Refresh the access token, collapsing concurrent callers onto a single
 * rotation. Rotation revokes the presented refresh token, so a second
 * simultaneous call would always fail.
 */
export async function refreshAccessToken(rotate: RotateFn = rotateViaApi): Promise<string | null> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const refreshToken = await loadRefreshToken();
    if (!refreshToken) return null;

    const session = await rotate(refreshToken);
    if (session === ROTATE_INDETERMINATE) {
      // A blip (network/timeout/5xx) — do not clear stored tokens, the
      // refresh token itself may still be good.
      return null;
    }
    if (!session) {
      await clearSession();
      return null;
    }

    await saveSession(session);
    return session.accessToken;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

apiClient.interceptors.request.use(async (requestConfig) => {
  const token = await loadAccessToken();
  if (token) {
    requestConfig.headers.set("Authorization", `Bearer ${token}`);
  }
  return requestConfig;
});

/** Test seam — same rejection handler passed to `interceptors.response.use`
 * below, exported so it can be exercised directly without an actual HTTP
 * round trip through axios. */
export async function __handleResponseError(error: unknown): Promise<unknown> {
  if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
    return Promise.reject(error);
  }

  const original = error.config as typeof error.config & { _retried?: boolean };

  // A 401 from the auth endpoints themselves (e.g. invalid_credentials on
  // login, or an already-rejected refresh) is not a signal that our stored
  // access token expired — attempting a rotation here would burn a good
  // refresh token over an unrelated failure like a mistyped password.
  if (isAuthEndpoint(original.url)) {
    return Promise.reject(error);
  }

  if (original._retried) return Promise.reject(error);
  original._retried = true;

  const token = await refreshAccessToken();
  if (!token) return Promise.reject(error);

  original.headers?.set("Authorization", `Bearer ${token}`);
  return apiClient.request(original);
}

apiClient.interceptors.response.use((response) => response, __handleResponseError);

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post("/api/v1/auth/login", { email, password });
  const data = loginResponseSchema.parse(res.data.data);
  await saveSession(data);
  return data;
}
