import { Router } from "express";
import bcrypt from "bcryptjs";
// Relative, not "@space/shared": tsc's rootDir here is the repo root (so it can
// also compile packages/shared), which emits this file to
// dist/apps/backend/src/routes/auth.js without rewriting bare specifiers. A
// package-name import would resolve at runtime via node_modules/@space/shared
// back to the TypeScript source instead of the compiled sibling output, and
// the built server would crash with ERR_MODULE_NOT_FOUND. Keep this relative.
import {
  acceptInviteRequestSchema,
  forgotPasswordRequestSchema,
  googleSignInRequestSchema,
  loginRequestSchema,
  refreshRequestSchema,
  resetPasswordRequestSchema,
} from "../../../../packages/shared/src/index";

import { db } from "../db/client";
import { verifyCredentials, type VerifiedUser } from "../lib/auth/credentials";
import { findGoogleUser, verifyGoogleIdToken } from "../lib/auth/google";
import { completePasswordReset, requestPasswordReset } from "../lib/auth/password-reset";
import { invalidateSessions } from "../lib/auth/session-validity";
import {
  hashToken,
  issueSession,
  revokeAllRefreshTokensForUser,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../lib/auth/tokens";
import { makeLimiter } from "../lib/rate-limit";
import { apiOk, apiError } from "../lib/api-response";
import { requireAuth, requireUser } from "../middleware/require-auth";
import { runInBackground } from "../lib/background";
import { config } from "../lib/config";

const authLimiter = makeLimiter({ name: "auth", windowMs: 15 * 60 * 1000, limit: 20 });
const refreshLimiter = makeLimiter({ name: "refresh", windowMs: 15 * 60 * 1000, limit: 60 });

// Same window and ceiling as authLimiter, but its OWN bucket: sharing the
// login limiter would let a few failed sign-ins lock a person out of
// activating, and vice versa.
const acceptInviteLimiter = makeLimiter({
  name: "accept-invite",
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

export const authRouter = Router();

authRouter.post("/login", authLimiter, async (req, res) => {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "Email and password are required.", 400);
  }

  const verified = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!verified) {
    return apiError(res, "invalid_credentials", "Incorrect email or password.", 401);
  }

  const issued = await issueSession(verified.id, req.get("user-agent"));
  if (!issued) {
    return apiError(res, "invalid_credentials", "Incorrect email or password.", 401);
  }

  return apiOk(res, sessionBody(issued, verified));
});

function sessionBody(
  issued: NonNullable<Awaited<ReturnType<typeof issueSession>>>,
  verified: VerifiedUser,
) {
  return {
    ...issued.session,
    user: { id: verified.id, name: verified.name, email: verified.email, role: issued.user.role },
  };
}

const NO_ACCOUNT_MESSAGE =
  "To sign in with Google, first set up your account with the invite code from your email.";

// Google sign-in (owner, 2026-11-09). Signs in an EXISTING account whose
// address Google has verified; it never creates one. A 404 until
// GOOGLE_CLIENT_IDS is set. Refusals are 400/403, never 401, so the app's
// refresh-on-401 interceptor has nothing to do with them.
authRouter.post("/google", authLimiter, async (req, res) => {
  if (config.googleClientIds.length === 0) return apiError(res, "not_found", "Not found.", 404);

  const parsed = googleSignInRequestSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, "bad_request", "A Google ID token is required.", 400);

  const identity = await verifyGoogleIdToken(parsed.data.idToken, config.googleClientIds);
  if (!identity) {
    return apiError(
      res,
      "invalid_google_token",
      "Google couldn't confirm this sign-in. Try again.",
      400,
    );
  }

  // Worded as the next step, never as "you aren't invited" (owner,
  // 2026-11-09): the app sends them to the invite-code screen.
  const noAccount = () => apiError(res, "no_account", NO_ACCOUNT_MESSAGE, 403);
  const verified = await findGoogleUser(identity.email);
  if (!verified) return noAccount();
  const issued = await issueSession(verified.id, req.get("user-agent"));
  if (!issued) return noAccount();

  return apiOk(res, sessionBody(issued, verified));
});

authRouter.post("/refresh", refreshLimiter, async (req, res) => {
  const parsed = refreshRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "refreshToken is required.", 400);
  }

  const session = await rotateRefreshToken(parsed.data.refreshToken, req.get("user-agent"));
  if (!session) {
    return apiError(res, "invalid_token", "Refresh token is invalid or expired.", 401);
  }

  return apiOk(res, session);
});

// v1's logout takes the refresh token in the body and is not access-token
// protected (jpc-space/src/app/api/v1/auth/logout/route.ts). Its body schema is
// identical to refresh's, so the same shared schema validates it.
//
// Intentional divergence from v1: the refresh limiter is applied. This endpoint
// performs an unauthenticated database write, and a legitimate client calls it
// once per session, so rate limiting costs nothing and closes a cheap
// write-amplification vector v1 left open.
authRouter.post("/logout", refreshLimiter, async (req, res) => {
  const parsed = refreshRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "refreshToken is required.", 400);
  }

  // revokeRefreshToken uses updateMany, so an unknown or already-revoked token
  // is a no-op. Returning 200 either way means logout is idempotent and never
  // discloses whether a token existed.
  await revokeRefreshToken(parsed.data.refreshToken);
  return apiOk(res, { ok: true });
});

// The route v1 never built (spec 11 D1 — every invite ever sent 404ed).
// Anonymous by design; possession of the code is the authorization, so it
// sits behind a strict limiter: an unauthenticated write against a
// guessable surface (spec 11 §7 note on the anonymous endpoints).
authRouter.post("/accept-invite", acceptInviteLimiter, async (req, res) => {
  const parsed = acceptInviteRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "A token and a password of at least 8 characters are required.", 400);
  }

  // ONE opaque refusal for every failure mode — unknown, used, expired,
  // already-activated target, deactivated target. v1 disclosed which (R27);
  // the distinction belongs in server-side behaviour only (D5 rec 3).
  const refuse = () => apiError(res, "invalid_invite", "This invite is invalid or has expired.", 400);

  const invite = await db.inviteToken.findUnique({
    where: { token: hashToken(parsed.data.token) },
    select: {
      id: true, userId: true, usedAt: true, expiresAt: true,
      user: { select: { passwordHash: true, deletedAt: true } },
    },
  });
  if (!invite) return refuse();
  if (invite.usedAt !== null) return refuse();
  if (invite.expiresAt < new Date()) return refuse();
  // D4 rec 2: an invite is an ACTIVATION, not a reset. v1's acceptInvite
  // would set the password of a live account (R31); refused here.
  if (invite.user.passwordHash !== null || invite.user.deletedAt !== null) return refuse();

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // Atomic consume: the guarded updateMany means two concurrent accepts of
  // the same token cannot both win — the loser's count is 0 (R28/R29 kept,
  // with the race v1's read-then-transact left open actually closed).
  const consumed = await db.$transaction(async (tx) => {
    const stamped = await tx.inviteToken.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (stamped.count === 0) return false;
    await tx.user.update({ where: { id: invite.userId }, data: { passwordHash } });
    return true;
  });
  if (!consumed) return refuse();

  return apiOk(res, { ok: true });
});

// Unlike /logout (one token, anonymous, idempotent), this revokes EVERYTHING
// the caller holds — the only recovery a user has when a device is lost
// (spec 18 D1). Authenticated: "everything of mine" needs a proven "me".
authRouter.post("/logout-all", requireAuth, async (req, res) => {
  const user = requireUser(req);
  // Plan 18 M13: the access tokens end with the refresh tokens, so a lost
  // phone loses access now, not within 900s.
  const revoked = await db.$transaction(async (tx) => {
    await invalidateSessions(tx, user.userId);
    return revokeAllRefreshTokensForUser(tx, user.userId);
  });
  return apiOk(res, { revoked });
});

// Own buckets (Plan 10 Decision 11), like acceptInviteLimiter: sharing the
// login limiter would let failed sign-ins lock a person out of recovering.
const forgotPasswordLimiter = makeLimiter({
  name: "forgot-password",
  windowMs: 15 * 60 * 1000,
  limit: 10,
});
const resetPasswordLimiter = makeLimiter({
  name: "reset-password",
  windowMs: 15 * 60 * 1000,
  limit: 20,
});

/**
 * Anonymous by design (spec 11 §4). The SAME body on every path (R67), and
 * the work runs after the response is sent, so the response time can't
 * reveal whether the address exists either (R69). v1 had no limiter here.
 */
authRouter.post("/forgot-password", forgotPasswordLimiter, (req, res) => {
  const parsed = forgotPasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(res, "bad_request", "A valid email is required.", 400);
  }
  runInBackground("password-reset", requestPasswordReset(parsed.data.email));
  return apiOk(res, { ok: true });
});

/**
 * Possession of the token is the authorization. One opaque failure,
 * invalid_reset_token, as 400 — not 401, which the mobile interceptor would
 * spend a refresh rotation on (Plan 9 Decision 10). The password is validated
 * by the schema before the token is looked at (R77's order kept), so a weak
 * password never consumes a token.
 */
authRouter.post("/reset-password", resetPasswordLimiter, async (req, res) => {
  const parsed = resetPasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return apiError(
      res,
      "bad_request",
      parsed.error.issues[0]?.message ?? "A reset code and a valid password are required.",
      400,
    );
  }
  const outcome = await completePasswordReset(parsed.data.token, parsed.data.password);
  if (outcome === "invalid") {
    return apiError(res, "invalid_reset_token", "This reset code is invalid or has expired. Request a new one.", 400);
  }
  return apiOk(res, { ok: true });
});
