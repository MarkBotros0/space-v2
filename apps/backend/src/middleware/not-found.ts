import type { Request, Response } from "express";

import { apiError } from "../lib/api-response";

/** Catch-all for any path that didn't match a router. Must be mounted after
 * every route so it only sees requests nothing else claimed. */
export function notFoundHandler(_req: Request, res: Response): void {
  apiError(res, "not_found", "The requested resource was not found.", 404);
}
