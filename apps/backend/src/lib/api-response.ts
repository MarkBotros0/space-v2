import type { Response } from "express";
import type { ApiErrorCode } from "@space/shared";

export function apiOk<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

/**
 * The failure envelope. `extra` sits beside `error` at the top level, for the
 * few refusals that carry a figure (e.g. `poll_votes_lost`'s `votes`).
 */
export function apiError(
  res: Response,
  code: ApiErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return res.status(status).json({ ...extra, error: { code, message } });
}
