import axios from "axios";

import { apiErrorMessage } from "./api-error";

export const UNREACHABLE_MESSAGE = "Can't reach JPC Space. Check your connection and try again.";
export const SERVER_TROUBLE_MESSAGE = "Something went wrong on our side. Try again in a moment.";

/**
 * What to tell a signed-out user when a request fails. Tells apart "the
 * server said no" from "we never reached it" and "it broke", so a dead
 * connection is never reported as a wrong password.
 *
 * - no response (offline, timeout): can't reach the server
 * - 401: `badCredentials`, the caller's copy for its own refusal
 * - 429 and other 4xx with a readable envelope: the server's own words
 * - 5xx, an unreadable body, or anything that is not an axios error
 *   (e.g. a schema parse failure): trouble on our side
 */
export function authErrorMessage(err: unknown, badCredentials: string): string {
  if (!axios.isAxiosError(err)) return SERVER_TROUBLE_MESSAGE;
  if (!err.response) return UNREACHABLE_MESSAGE;
  const status = err.response.status;
  if (status === 401) return badCredentials;
  if (status >= 400 && status < 500) return apiErrorMessage(err, SERVER_TROUBLE_MESSAGE);
  return SERVER_TROUBLE_MESSAGE;
}
