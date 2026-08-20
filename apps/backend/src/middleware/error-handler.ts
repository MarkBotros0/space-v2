import type { ErrorRequestHandler } from "express";

import { apiError } from "../lib/api-response";
import { ForbiddenError, UnauthorizedError } from "../lib/auth/errors";

/** body-parser (express.json()) rejects malformed bodies with a SyntaxError
 * carrying this `type`. Detecting it here lets us return the envelope shape
 * instead of Express's default HTML error page. */
function isBodyParseError(err: unknown): err is SyntaxError & { type?: string } {
  return err instanceof SyntaxError && (err as { type?: string }).type === "entity.parse.failed";
}

/** Terminal error handler. Must be the last middleware mounted (Express
 * recognizes it as an error handler by its four-argument arity). Never
 * includes err.stack or err.message in the response body, regardless of
 * NODE_ENV, so a bug doesn't leak internals to the client. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (isBodyParseError(err)) {
    apiError(res, "bad_request", "Invalid JSON body.", 400);
    return;
  }

  // v1 mapped these inside withApiAuth; Express 5 forwards async rejections
  // here instead, so the mapping lives in one place for every route.
  if (err instanceof ForbiddenError) {
    apiError(res, "forbidden", "You don't have access to this.", 403);
    return;
  }

  if (err instanceof UnauthorizedError) {
    apiError(res, "unauthorized", "Not authenticated.", 401);
    return;
  }

  // Server-side log for an otherwise-unhandled error; the client only ever
  // gets the generic message below.
  console.error(err);
  apiError(res, "internal_error", "An unexpected error occurred.", 500);
};
