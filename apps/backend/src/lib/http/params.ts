import type { Response } from "express";

import { apiError } from "../api-response";
import { parseId } from "../parse-id";

/**
 * A positive integer path param, or null after answering 400
 * `Invalid <noun> id.` (the message every route already sends). The caller
 * returns on null:
 *
 *     const id = idParam(res, req.params.id, "season");
 *     if (id === null) return;
 */
export function idParam(res: Response, raw: string | string[] | undefined, noun: string): number | null {
  const id = parseId(raw);
  if (id === null) apiError(res, "bad_request", `Invalid ${noun} id.`, 400);
  return id;
}
