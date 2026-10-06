import type { Session } from "@space/shared";

// expo-secure-store has no web implementation, so the web build (`expo start
// --web`) keeps tokens in localStorage instead. Metro picks this file over
// token-storage.ts on web only; native builds and Jest never see it. This is a
// dev/testing convenience — localStorage is readable by any script on the page.
const ACCESS_KEY = "space.accessToken";
const REFRESH_KEY = "space.refreshToken";

export async function saveSession(session: Session): Promise<void> {
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
}

export async function loadAccessToken(): Promise<string | null> {
  return localStorage.getItem(ACCESS_KEY);
}

export async function loadRefreshToken(): Promise<string | null> {
  return localStorage.getItem(REFRESH_KEY);
}

export async function clearSession(): Promise<void> {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}
