import axios from "axios";
import Constants from "expo-constants";
import type { LoginResponse, Session } from "@space/shared";

import { clearSession, loadAccessToken, loadRefreshToken, saveSession } from "./token-storage";

const baseURL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "http://localhost:4000";

export const apiClient = axios.create({ baseURL, timeout: 15000 });

export type RotateFn = (refreshToken: string) => Promise<Session | null>;

let inFlight: Promise<string | null> | null = null;

/** Test seam — clears the shared in-flight refresh promise between cases. */
export function __resetRefreshState(): void {
  inFlight = null;
}

async function rotateViaApi(refreshToken: string): Promise<Session | null> {
  try {
    const res = await axios.post(`${baseURL}/api/v1/auth/refresh`, { refreshToken });
    return res.data.data as Session;
  } catch {
    return null;
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error);
    }

    const original = error.config as typeof error.config & { _retried?: boolean };
    if (original._retried) return Promise.reject(error);
    original._retried = true;

    const token = await refreshAccessToken();
    if (!token) return Promise.reject(error);

    original.headers?.set("Authorization", `Bearer ${token}`);
    return apiClient.request(original);
  },
);

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post("/api/v1/auth/login", { email, password });
  const data = res.data.data as LoginResponse;
  await saveSession(data);
  return data;
}
