import { Router } from "express";

import {
  DEVICE_PLATFORM_TO_DB,
  deviceRegistrationSchema,
  deviceUnregistrationSchema,
} from "../../../../packages/shared/src/index";
import { db } from "../db/client";
import { apiOk, apiError } from "../lib/api-response";
import { requireAuth, requireUser } from "../middleware/require-auth";

/**
 * This device's Expo push token, mounted under /api/v1/me.
 *
 * The token is a credential: it is never logged and never returned.
 */
export const meDevicesRouter = Router();

/**
 * Register (or refresh) this device. Upsert on the token, re-pointing it at the
 * caller: a phone handed to another user moves with the sign-in instead of
 * notifying both people. Calling it again just bumps `lastSeenAt`.
 */
meDevicesRouter.post("/devices", requireAuth, async (req, res) => {
  const parsed = deviceRegistrationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid device registration.", 400);

  const user = requireUser(req);
  const platform = DEVICE_PLATFORM_TO_DB[parsed.data.platform];
  await db.deviceToken.upsert({
    where: { token: parsed.data.token },
    update: { userId: user.userId, platform, lastSeenAt: new Date() },
    create: { userId: user.userId, token: parsed.data.token, platform },
  });
  return apiOk(res, { registered: true });
});

/**
 * Unregister on sign-out. The token travels in the body, not the path (it is
 * a credential and paths end up in access logs), and the delete is scoped to
 * the caller so a token string is never a delete primitive for someone else.
 * Idempotent: an unknown token is still a success.
 */
meDevicesRouter.delete("/devices", requireAuth, async (req, res) => {
  const parsed = deviceUnregistrationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid device token.", 400);

  const user = requireUser(req);
  await db.deviceToken.deleteMany({ where: { token: parsed.data.token, userId: user.userId } });
  return apiOk(res, { unregistered: true });
});
