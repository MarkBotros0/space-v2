import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { isEmailConfigured } from "../../lib/email";
import { issueInvite, listPendingInviteUserIds, sendPendingInviteBatch } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
import { rateLimitHandler } from "../../lib/rate-limit";
import { sendInviteEmailBestEffort } from "../invite-email";
import { requireSuper } from "./super-only";
import { loadUserDetail } from "./views";

// Own bucket (Plan 10 Decision 11). With the 20-user batch ceiling this caps
// bulk sending at 600 invites an hour.
export const bulkInviteLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, handler: rateLimitHandler });

/** How many accounts the bulk button would reach (R87: hidden at zero). */
export async function countPendingInvites(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  const ids = await listPendingInviteUserIds();
  return apiOk(res, { pending: ids.length });
}

/**
 * "Send all pending invites" (v1 sendAllPendingInvitesAction,
 * invite-actions.ts:53-75) as ONE bounded batch per request — Plan 10
 * Decision 12. Refuses outright with no mail transport: minting codes nobody
 * receives would also empty the pending pool, hiding the very accounts that
 * still need an invite.
 */
export async function sendPendingInvites(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  if (!isEmailConfigured()) {
    return apiError(
      res,
      "email_not_configured",
      "Email isn't configured on this server, so invites can't be delivered.",
      503,
    );
  }
  const result = await sendPendingInviteBatch(user.userId);
  return apiOk(res, result);
}

export async function resendInvite(req: Request, res: Response) {
  const user = requireSuper(req, res);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);

  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, passwordHash: true, lastLoginAt: true, deletedAt: true },
  });
  if (!target) return apiError(res, "not_found", "User not found.", 404);
  // Explicit refusals where v1 silently dropped (R16): this is an
  // authenticated SUPER pressing a button on one row, and deserves an answer.
  if (target.deletedAt) return apiError(res, "user_deleted", "This account is deactivated.", 409);
  if (target.passwordHash !== null || target.lastLoginAt !== null) {
    return apiError(res, "already_activated", "This account is already activated.", 409);
  }

  const invite = await db.$transaction((tx) => issueInvite(tx, id, user.userId));

  await sendInviteEmailBestEffort(id, target.email, invite.raw, invite.expiresAt);

  // The panel the detail screen renders, read back from the row just written
  // (loadUserDetail returns the latest invite, which is this one).
  const detail = await loadUserDetail(id);
  return apiOk(res, detail!.invite);
}
