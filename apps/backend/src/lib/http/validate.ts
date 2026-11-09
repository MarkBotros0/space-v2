import type { Response } from "express";
import type { z } from "zod";

import { apiError } from "../api-response";

/**
 * Parse `input` with `schema`, or answer 400 `bad_request` with `message` and
 * return null. Each route keeps its own message ("Invalid result body.",
 * "Invalid query.", ...), so this changes no response.
 */
export function parseOr400<S extends z.ZodType>(
  schema: S,
  input: unknown,
  res: Response,
  message: string,
): z.output<S> | null {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    apiError(res, "bad_request", message, 400);
    return null;
  }
  return parsed.data;
}
