import type { ApiErrorCode } from "@space/shared";

import type { SeatRefusal } from "./roles/seat-rules";

/**
 * A refusal thrown from anywhere below a route: a service, a transaction, a
 * helper. The terminal error handler (middleware/error-handler.ts) answers it
 * with the envelope, `{ ...extra, error: { code, message } }` at `status`,
 * exactly as `apiError` would, and never reports it to Sentry. Throwing it
 * inside `db.$transaction` also rolls the transaction back, which is what the
 * hand-made `fail` tuples and `EndRefused` do today.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A seat refusal's status: 404 for `not_found`, 409 for everything else. */
export function refusalStatus(refusal: SeatRefusal): 404 | 409 {
  return refusal.code === "not_found" ? 404 : 409;
}

/** A seat refusal as a throwable ApiError, with `refusalStatus`'s status. */
export function toApiError(refusal: SeatRefusal): ApiError {
  return new ApiError(refusal.code, refusal.message, refusalStatus(refusal));
}
