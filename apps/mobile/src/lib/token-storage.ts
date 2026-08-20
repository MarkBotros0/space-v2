import * as SecureStore from "expo-secure-store";
import type { Session } from "@space/shared";

const ACCESS_KEY = "space.accessToken";
const REFRESH_KEY = "space.refreshToken";

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
}

export async function loadAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
