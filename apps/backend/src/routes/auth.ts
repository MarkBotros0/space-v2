import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginRequestSchema, refreshRequestSchema } from "@space/shared";

import { verifyCredentials } from "../lib/auth/credentials";
import { issueSession, rotateRefreshToken } from "../lib/auth/tokens";
import { apiOk, apiError } from "../lib/api-response";

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

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

authRouter.post("/refresh", async (req, res) => {
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
