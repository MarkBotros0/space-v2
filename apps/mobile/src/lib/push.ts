// apps/mobile/src/lib/push.ts
import axios from "axios";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { apiClient } from "./api-client";
import { easProjectId } from "./app-config";
import { savePushToken } from "./token-storage";
import { useSessionStore } from "../store/session";

export type PushTokenResult =
  | { kind: "token"; token: string }
  | { kind: "denied" }
  | { kind: "not_configured" }
  | { kind: "failed" };

export type PushStatus = "registered" | "unavailable" | "denied" | "not_configured" | "failed";

/**
 * Ask for notification permission (once) and get this device's Expo token.
 *
 * Called from an explicit control in settings, never from an effect on app
 * start: a permission prompt that appears at a moment the user did not ask for
 * is the fastest way to get it denied permanently.
 *
 * Never throws. Each way it can come back empty is reported as itself — an
 * earlier draft folded "this build has no EAS project id" into "denied", which
 * told the user they had refused something they had accepted.
 */
export async function requestPushToken(): Promise<PushTokenResult> {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return { kind: "denied" };

  const projectId = easProjectId();
  if (projectId === null) return { kind: "not_configured" };

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { kind: "token", token: token.data };
  } catch (err) {
    // The error, never a token (there is none) — and never log a token anywhere.
    console.warn("[push] could not obtain an Expo push token:", err instanceof Error ? err.message : err);
    return { kind: "failed" };
  }
}

/**
 * Hand the token to the API.
 *
 * `503 push_unavailable` is the expected answer until the cutover migration
 * adds the DeviceToken table (see
 * docs/superpowers/cutover/2026-08-24-notifications-push.md). It is a state,
 * not an error: the caller keeps the token and stops retrying.
 */
export async function registerPushToken(token: string): Promise<"registered" | "unavailable" | "failed"> {
  try {
    await apiClient.post("/api/v1/me/devices", {
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
    });
    return "registered";
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 503) return "unavailable";
    return "failed";
  }
}

/** Permission → token → store → server, in one call for the settings control. */
export async function enablePush(): Promise<{ token: string | null; status: PushStatus }> {
  const result = await requestPushToken();
  if (result.kind !== "token") return { token: null, status: result.kind };

  useSessionStore.getState().setPushToken(result.token);
  await savePushToken(result.token);

  const status = await registerPushToken(result.token);
  return { token: result.token, status };
}
