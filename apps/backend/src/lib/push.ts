import { db } from "../db/client";
import type { NotificationTarget } from "@space/shared";

import { config } from "./config";

/**
 * Push through Expo's push service, which forwards to FCM (Android) and APNs
 * (iOS). One HTTPS call per 100 devices; no SDK.
 *
 * Tokens are credentials: they are never logged. Tickets that say the device
 * is gone (`DeviceNotRegistered`) delete that token so it isn't retried.
 */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

interface PushPayload {
  title: string;
  body?: string | null;
  /**
   * Read by the app on tap: `target` is the same route-independent target the
   * inbox renders (lib/notification-target.ts), so the app opens the same
   * screen a tap in the inbox would. Null opens the inbox.
   */
  data: { type: string; target: NotificationTarget | null };
}

interface ExpoTicket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export async function sendPushToUsers(userIds: readonly number[], payload: PushPayload): Promise<void> {
  if (!config.enablePush || userIds.length === 0) return;
  const devices = await db.deviceToken.findMany({
    where: { userId: { in: [...userIds] } },
    select: { token: true },
  });
  const tokens = devices.map((d) => d.token);
  for (let i = 0; i < tokens.length; i += BATCH) {
    await sendBatch(tokens.slice(i, i + BATCH), payload);
  }
}

async function sendBatch(tokens: string[], payload: PushPayload): Promise<void> {
  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    ...(payload.body ? { body: payload.body } : {}),
    data: payload.data,
    sound: "default",
    channelId: "default",
  }));
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (config.expoAccessToken) headers.authorization = `Bearer ${config.expoAccessToken}`;

  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Expo push answered ${res.status}`);

  const json = (await res.json()) as { data?: ExpoTicket[] };
  const tickets = json.data ?? [];
  const gone = tokens.filter((_, i) => tickets[i]?.details?.error === "DeviceNotRegistered");
  if (gone.length > 0) await db.deviceToken.deleteMany({ where: { token: { in: gone } } });

  const failed = tickets.filter((t) => t.status === "error" && t.details?.error !== "DeviceNotRegistered");
  if (failed.length > 0) {
    // The reason, never the token.
    console.warn(`[push] ${failed.length} of ${tokens.length} messages refused:`, failed[0]?.details?.error ?? failed[0]?.message);
  }
}
