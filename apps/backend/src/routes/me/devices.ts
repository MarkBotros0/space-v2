import { Router } from "express";

import {
  DEVICE_PLATFORM_TO_DB,
  deviceRegistrationSchema,
  deviceUnregistrationSchema,
} from "../../../../../packages/shared/src/index";
import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { makeLimiter } from "../../lib/rate-limit";
import { requireAuth, requireUser } from "../../middleware/require-auth";

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
 * Unregister a device: `POST /api/v1/devices/unregister`, mounted outside
 * /me because it needs no sign-in. The push token itself is the proof — only
 * this phone and our server know it — so the app can stop pushes both at
 * sign-out and after a forced sign-out, when its session is already dead and
 * an authenticated call is impossible (otherwise that phone would keep getting
 * the previous user's pushes until the next sign-in re-pointed it).
 *
 * The token is in the body, never the path (paths reach access logs).
 * Idempotent and opaque: an unknown token answers the same 200, so the
 * endpoint can't be used to test whether a token is registered.
 */
const unregisterLimiter = makeLimiter({
  name: "device-unregister",
  limit: 30,
});

export const devicesRouter = Router();

devicesRouter.post("/unregister", unregisterLimiter, async (req, res) => {
  const parsed = deviceUnregistrationSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "Invalid device token.", 400);

  await db.deviceToken.deleteMany({ where: { token: parsed.data.token } });
  return apiOk(res, { unregistered: true });
});
