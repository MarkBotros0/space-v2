import { useState } from "react";
import type { ZodError, ZodType } from "zod";

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

/**
 * A form's field errors from a shared schema. `validate(body)` sets the first
 * error per field and answers false, or clears them and answers true; the form
 * then sends `body` itself (not the parsed copy), as it always has.
 */
export function useSchemaErrors(schema: ZodType) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const validate = (input: unknown): boolean => {
    const parsed = schema.safeParse(input);
    setErrors(parsed.success ? {} : firstErrorByField(parsed.error));
    return parsed.success;
  };
  return { errors, setErrors, validate };
}
