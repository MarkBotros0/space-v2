import axios from "axios";
import { apiErrorBodySchema } from "@space/shared";

/**
 * The server's own message for a failed request, or `fallback`.
 *
 * Parsed against the envelope schema rather than read by cast: a 502 from a
 * proxy (HTML body) or a network error (no response) must not render
 * "undefined" on a form.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback;
  const parsed = apiErrorBodySchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data.error.message : fallback;
}

/** The envelope's machine code (e.g. "has_student_records"), or null. Screens branch on this, never on message text. */
export function apiErrorCode(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const parsed = apiErrorBodySchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data.error.code : null;
}
