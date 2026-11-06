import axios from "axios";
import { apiErrorBodySchema } from "@space/shared";

const REFRESH_INDETERMINATE = Symbol("refresh-indeterminate");

/** Tag a 401 whose refresh neither worked nor was refused: the session may be fine. */
export function markRefreshIndeterminate<T extends object>(err: T): T {
  return Object.assign(err, { [REFRESH_INDETERMINATE]: true });
}

export function isRefreshIndeterminate(err: unknown): boolean {
  return typeof err === "object" && err !== null && REFRESH_INDETERMINATE in err;
}

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

/** The API's `404 not_found` — "this does not exist for you", which no retry can change. */
export function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404 && apiErrorCode(err) === "not_found";
}
