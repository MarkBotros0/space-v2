import type { Response } from "express";

import { apiError } from "../lib/api-response";

/**
 * The generic 403 every route answers when a permission gate refuses. One
 * spelling of the envelope instead of ninety copies of the same literal; a
 * refusal with a more specific message still calls apiError directly.
 */
export function forbidden(res: Response): Response {
  return apiError(res, "forbidden", "You don't have access to this.", 403);
}
