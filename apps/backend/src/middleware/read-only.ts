import type { RequestHandler } from "express";

import { apiError } from "../lib/api-response";
import { config } from "../lib/config";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Writes still accepted while frozen. They write only RefreshToken /
 * lastLoginAt bookkeeping, which the runbook's smoke test (R13) needs in order
 * to sign in. A restore of the R8 backup discards them, and that costs the
 * affected accounts one extra sign-in - nothing a user created.
 */
export const READ_ONLY_ALLOWED_WRITES: ReadonlySet<string> = new Set([
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/refresh",
  "POST /api/v1/auth/logout",
]);

/**
 * The cutover freeze. Mounted before the body parsers and every router, like
 * the uploads guard, so a refused write costs nothing and never reaches Prisma.
 * `config.readOnly` is read per request so a test can flip it via jest.mock.
 */
export const readOnlyGuard: RequestHandler = (req, res, next) => {
  if (!config.readOnly || SAFE_METHODS.has(req.method)) return next();
  if (READ_ONLY_ALLOWED_WRITES.has(`${req.method} ${req.path}`)) return next();
  res.set("Retry-After", "600");
  apiError(
    res,
    "read_only",
    "JPC Space is in read-only maintenance. Please try again shortly.",
    503,
  );
};
