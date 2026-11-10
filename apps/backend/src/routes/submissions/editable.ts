import type { Response } from "express";

import { apiError } from "../../lib/api-response";

/** 409 for a student write to an essay that is no longer theirs to change. */
export function submissionLocked(res: Response) {
  return apiError(res, "submission_locked", "This essay has been handed in and can no longer be changed.", 409);
}
