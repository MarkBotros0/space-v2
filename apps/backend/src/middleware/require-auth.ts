import type { NextFunction, Request, Response } from "express";

import { apiError } from "../lib/api-response";
import { UnauthorizedError } from "../lib/auth/errors";
import { verifyAccessToken, type SessionUser } from "../lib/auth/tokens";

const UNAUTHORIZED_MESSAGE = "Missing or invalid access token.";

/** Resolve the SessionUser from a Bearer access token onto req.user, or 401. */
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

  const user = await verifyAccessToken(token);
  if (!user) {
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
