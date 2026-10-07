import type { Options as RateLimitOptions } from "express-rate-limit";

import { apiError } from "./api-response";

/**
 * express-rate-limit's default 429 body is plain text, which would be the one
 * response in the API outside the { error: { code, message } } envelope
 * (CLAUDE.md "Response envelope"). Extracted from routes/auth.ts so every
 * limiter in the backend — auth, password change, note reads, exports,
 * imports — shares this one handler instead of growing copies that drift
 * (ruling X4).
 */
export const rateLimitHandler: RateLimitOptions["handler"] = (_req, res) => {
  apiError(res, "too_many_requests", "Too many requests. Please try again later.", 429);
};
