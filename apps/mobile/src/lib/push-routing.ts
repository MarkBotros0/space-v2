import { notificationTargetSchema } from "@space/shared";

import { routeForTarget, type NotificationRoute } from "./notification-route";

type PushRoute = NotificationRoute | { pathname: "/notifications" };

/**
 * A tapped push → the screen to open. The data is `{ type, target }` from the
 * backend (lib/push.ts there); `target` maps through the same `routeForTarget`
 * the inbox uses. Anything missing or malformed opens the inbox instead of
 * guessing.
 */
export function routeForPushData(data: unknown): PushRoute {
  const raw = (data as { target?: unknown } | null | undefined)?.target;
  const parsed = notificationTargetSchema.nullable().safeParse(raw ?? null);
  return (parsed.success ? routeForTarget(parsed.data) : null) ?? { pathname: "/notifications" };
}
