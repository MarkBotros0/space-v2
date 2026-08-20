import { Router } from "express";
import rateLimit, { type Options as RateLimitOptions } from "express-rate-limit";
// Relative, not "@space/shared": tsc's rootDir here is the repo root (so it can
// also compile packages/shared), which emits this file to
// dist/apps/backend/src/routes/auth.js without rewriting bare specifiers. A
// package-name import would resolve at runtime via node_modules/@space/shared
// back to the TypeScript source instead of the compiled sibling output, and
// the built server would crash with ERR_MODULE_NOT_FOUND. Keep this relative.
import { loginRequestSchema, refreshRequestSchema } from "../../../../packages/shared/src/index";

import { verifyCredentials } from "../lib/auth/credentials";
import { issueSession, rotateRefreshToken } from "../lib/auth/tokens";
import { apiOk, apiError } from "../lib/api-response";

const rateLimitHandler: RateLimitOptions["handler"] = (_req, res) => {
  apiError(res, "too_many_requests", "Too many requests. Please try again later.", 429);
};

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, handler: rateLimitHandler });
const refreshLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, handler: rateLimitHandler });

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

  return apiOk(res, {
    ...issued.session,
    user: {
      id: verified.id,
      name: verified.name,
      email: verified.email,
      role: verified.role,
    },
  });
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
