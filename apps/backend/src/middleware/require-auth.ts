import type { NextFunction, Request, Response } from "express";

import { apiError } from "../lib/api-response";
import { UnauthorizedError } from "../lib/auth/errors";
import { isAccessTokenInvalidated } from "../lib/auth/session-validity";
import { verifyAccessToken, type SessionUser } from "../lib/auth/tokens";

const UNAUTHORIZED_MESSAGE = "Missing or invalid access token.";

/**
 * Resolve the SessionUser from a Bearer access token onto req.user, or 401.
 * A token issued before the user's `sessionsValidFrom` (Plan 18 M13) is
 * refused with the same 401 as an expired one, so the client refreshes —
 * which works only if its refresh token survived — or signs out.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  const token = header.slice(7).trim();
  if (!token) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  const verified = await verifyAccessToken(token);
  if (!verified) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  const { issuedAt, ...user } = verified;
  if (await isAccessTokenInvalidated(user.userId, issuedAt)) {
    apiError(res, "unauthorized", UNAUTHORIZED_MESSAGE, 401);
    return;
  }

  req.user = user;
  next();
}

/**
 * Read back what requireAuth set. Throwing rather than returning null keeps
 * handlers free of non-null assertions: if this ever throws, the route was
 * mounted without requireAuth in front of it, which is a wiring bug, and the
 * error handler turns it into a 401 rather than a crash.
 */
export function requireUser(req: Request): SessionUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}

/**
 * The signed-in user when `allowed(user)` holds, else null after answering 403
 * `forbidden` with `message` (the generic one unless the route has its own).
 * Replaces `requireUser` plus a role check on the next line, in place, so the
 * order of a handler's checks doesn't change:
 *
 *     const user = requireRole(req, res, isSuper);
 *     if (!user) return;
 */
export function requireRole(
  req: Request,
  res: Response,
  allowed: (user: SessionUser) => boolean,
  message = "You don't have access to this.",
): SessionUser | null {
  const user = requireUser(req);
  if (allowed(user)) return user;
  apiError(res, "forbidden", message, 403);
  return null;
}
