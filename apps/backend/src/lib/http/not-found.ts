import type { Response } from "express";

import { apiError } from "../api-response";

/** 404 `not_found` with `<Noun> not found.`, the message every route already sends. */
export function notFound(res: Response, noun: string): Response {
  return apiError(res, "not_found", `${noun} not found.`, 404);
}
