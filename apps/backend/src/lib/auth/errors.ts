import { ApiError } from "../api-error";

/** No signed-in user where a route needs one. Answers 401 `unauthorized`. */
export class UnauthorizedError extends ApiError {
  constructor() {
    super("unauthorized", "Not authenticated.", 401);
    this.name = "UnauthorizedError";
  }
}

/** The caller may not do this. Answers 403 `forbidden` with the generic message. */
export class ForbiddenError extends ApiError {
  constructor() {
    super("forbidden", "You don't have access to this.", 403);
    this.name = "ForbiddenError";
  }
}
