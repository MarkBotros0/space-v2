import type { ZodError } from "zod";

/**
 * First message per field, keyed by the issue path's LAST segment
 * ("start.time" → "time"), for `Input`'s `error` prop. Forms validate
 * with the SAME shared schema the server uses (spec 02 §8), so a client
 * error and a server 400 can never disagree about what is valid.
 */
export function firstErrorByField(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[issue.path.length - 1] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
