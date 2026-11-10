import axios from "axios";
import { z } from "zod";
import { API_ERROR_CODES, apiErrorBodySchema, pollVotesLostSchema, type ApiErrorCode } from "@space/shared";

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

/** The HTTP status of a failed request, or undefined when there was no response (offline, timeout) or it wasn't a request. */
export function apiErrorStatus(err: unknown): number | undefined {
  return axios.isAxiosError(err) ? err.response?.status : undefined;
}

/** A request that never got an answer: offline, DNS, timeout. */
export function isNetworkError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

const KNOWN_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

/**
 * The envelope's machine code (e.g. "has_student_records"), or null. Screens
 * branch on this, never on message text. Typed as the shared catalogue, so
 * comparing it with a misspelt code fails the typecheck; a code the catalogue
 * doesn't know reads as null.
 */
export function apiErrorCode(err: unknown): ApiErrorCode | null {
  if (!axios.isAxiosError(err)) return null;
  const parsed = apiErrorBodySchema.safeParse(err.response?.data);
  if (!parsed.success) return null;
  const { code } = parsed.data.error;
  return KNOWN_CODES.has(code) ? (code as ApiErrorCode) : null;
}

/** The API's `404 not_found` — "this does not exist for you", which no retry can change. */
export function isNotFoundError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404 && apiErrorCode(err) === "not_found";
}

/** How many votes an edit would erase, read off a 409 `poll_votes_lost` (its `votes` field); null for any other error. */
export function pollVotesLost(err: unknown): number | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 409) return null;
  if (apiErrorCode(err) !== "poll_votes_lost") return null;
  const parsed = pollVotesLostSchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data.votes : null;
}

const needsConfirmationSchema = z.object({ students: z.number().int().min(0) });

/** How many students' work a save would change, read off a 409 `needs_confirmation` (its `students` field); null for any other error. */
export function needsConfirmation(err: unknown): number | null {
  if (!axios.isAxiosError(err) || err.response?.status !== 409) return null;
  if (apiErrorCode(err) !== "needs_confirmation") return null;
  const parsed = needsConfirmationSchema.safeParse(err.response?.data);
  return parsed.success ? parsed.data.students : null;
}
