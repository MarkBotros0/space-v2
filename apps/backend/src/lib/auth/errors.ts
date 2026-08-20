export class UnauthorizedError extends Error {
  readonly code: string;
  constructor(message = "Not authenticated", code = "UNAUTHORIZED", options?: ErrorOptions) {
    super(message, options);
    this.name = "UnauthorizedError";
    this.code = code;
  }
}

export class ForbiddenError extends Error {
  readonly code: string;
  constructor(message = "Forbidden", code = "FORBIDDEN", options?: ErrorOptions) {
    super(message, options);
    this.name = "ForbiddenError";
    this.code = code;
  }
}
