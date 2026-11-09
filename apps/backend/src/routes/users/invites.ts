import type { Request, Response } from "express";

import { db } from "../../db/client";
import { apiOk, apiError } from "../../lib/api-response";
import { isEmailConfigured } from "../../lib/email";
import { listPendingInviteUserIds, resendInvite as resendInviteNow, sendPendingInviteBatch } from "../../lib/invites";
import { parseId } from "../../lib/parse-id";
import { makeLimiter } from "../../lib/rate-limit";
import { loadUserDetail } from "./views";
import { requireRole } from "../../middleware/require-auth";
import { canManageUsers } from "../../lib/rbac";

// Own bucket (Plan 10 Decision 11). With the 20-user batch ceiling this caps
// bulk sending at 600 invites an hour.
export const bulkInviteLimiter = makeLimiter({
  name: "bulk-invite",
  windowMs: 60 * 60 * 1000,
  limit: 30,
});

/** The one 503 every invite-sending path answers with no mail transport. */
function emailNotConfigured(res: Response) {
  return apiError(
    res,
    "email_not_configured",
    "Email isn't configured on this server, so invites can't be delivered.",
    503,
  );
}

/** How many accounts the bulk button would reach (R87: hidden at zero). */
export async function countPendingInvites(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
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
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  if (!isEmailConfigured()) return emailNotConfigured(res);
  const result = await sendPendingInviteBatch(user.userId);
  return apiOk(res, result);
}

export async function resendInvite(req: Request, res: Response) {
  const user = requireRole(req, res, canManageUsers);
  if (!user) return;
  const id = parseId(req.params.id);
  if (id === null) return apiError(res, "bad_request", "Invalid user id.", 400);
  return answerResend(res, id, user.userId);
}

/**
 * Re-send one person's invite and answer with their invite panel. Shared by
 * the Super's `POST /users/:id/invite` and `POST /students/:id/invite`, which a
 * season's admin may call too (owner, 2026-11-07); each route gates first.
 */
export async function answerResend(res: Response, id: number, byUserId: number) {
  const target = await db.user.findUnique({
    where: { id },
    select: { email: true, passwordHash: true, lastLoginAt: true, deletedAt: true },
  });
  if (!target) return apiError(res, "not_found", "User not found.", 404);
  // Explicit refusals where v1 silently dropped (R16): this is someone
  // pressing a button on one person, and deserves an answer.
  if (target.deletedAt) return apiError(res, "user_deleted", "This account is deactivated.", 409);
  if (target.passwordHash !== null || target.lastLoginAt !== null) {
    return apiError(res, "already_activated", "This account is already activated.", 409);
  }

  // Send first, expire the old code only after the mail went (resendInvite):
  // a failure here must never leave the person without a working code.
  const outcome = await resendInviteNow(id, byUserId, target.email);
  if (outcome === "email_not_configured") return emailNotConfigured(res);
  if (outcome === "send_failed") {
    return apiError(
      res,
      "email_send_failed",
      "The invite email couldn't be sent. Any earlier invite still works — try again later.",
      502,
    );
  }

  // The panel the detail screen renders, read back from the row just written
  // (loadUserDetail returns the latest invite, which is this one).
  const detail = await loadUserDetail(id);
  return apiOk(res, detail!.invite);
}
