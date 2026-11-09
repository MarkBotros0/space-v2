import { Router } from "express";

import { apiError, apiOk } from "../lib/api-response";
import { config } from "../lib/config";
import { isCronAuthorized } from "../lib/follow-ups";
import { purgeRetained } from "../lib/retention";

/** Mounted at /api/v1/internal, beside the follow-up reminder. */
export const retentionRouter = Router();

/** Vercel Cron calls this daily with GET (vercel.json). A 404 while CRON_SECRET is unset. */
retentionRouter.get("/retention/purge", async (req, res) => {
  const secret = config.cronSecret;
  if (!secret) return apiError(res, "not_found", "Not found.", 404);
  if (!isCronAuthorized(req.get("authorization"), secret)) {
    return apiError(res, "unauthorized", "Not authorized.", 401);
  }
  return apiOk(res, { deleted: await purgeRetained() });
});
